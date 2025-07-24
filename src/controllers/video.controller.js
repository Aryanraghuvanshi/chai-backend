import mongoose, {isValidObjectId} from "mongoose"
import {Video} from "../models/video.model.js"
import {User} from "../models/user.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import { uplodeOnCloudinary} from "../utils/cloudinary.js"


// get all videos based on query, sort, pagination
const getAllVideos = asyncHandler(async (req, res) => {
    // 1️⃣ Extract query parameters with default values
    const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query;

    // 2️⃣ Create a MongoDB aggregation pipeline (steps to filter/sort data)
    const pipeline = [];

    // 3️⃣ Full-text search on title and description (if query is provided)
    // Requires MongoDB Atlas Search Index named "search-videos"
    if (query) {
        pipeline.push({
            $search: {
                index: "search-videos",
                text: {
                    query: query,
                    path: ["title", "description"] // Only search in title and description
                }
            }
        });
    }

    // 4️⃣ Filter videos by userId if provided (e.g., fetch all videos by a specific user)
    if (userId) {
        if (!isValidObjectId(userId)) {
            throw new ApiError(400, "Invalid userId");
        }

        pipeline.push({
            $match: {
                owner: new mongoose.Types.ObjectId(userId) // Convert userId to ObjectId
            }
        });
    }

    // 5️⃣ Only include videos that are published (public videos)
    pipeline.push({
        $match: {
            isPublished: true
        }
    });

    // 6️⃣ Add sorting logic
    // If sortBy and sortType are provided (e.g., sort by views or createdAt)
    // sortType can be "asc" (1) or "desc" (-1)
    if (sortBy && sortType) {
        pipeline.push({
            $sort: {
                [sortBy]: sortType === "asc" ? 1 : -1
            }
        });
    } else {
        // Default sort by newest first (descending by createdAt)
        pipeline.push({
            $sort: {
                createdAt: -1
            }
        });
    }

    // 7️⃣ Join (lookup) user details from the "users" collection
    pipeline.push(
        {
            $lookup: {
                from: "users",                 // Join with "users" collection
                localField: "owner",          // Link by "owner" field
                foreignField: "_id",          // Match with "_id" of user
                as: "ownerDetails",           // Save result in this field
                pipeline: [                   // Only get limited fields from user
                    {
                        $project: {
                            username: 1,
                            "avatar.url": 1
                        }
                    }
                ]
            }
        },
        {
            $unwind: "$ownerDetails" // Convert ownerDetails array into a single object
        }
    );

    // 8️⃣ Apply pagination using mongoose-aggregate-paginate-v2
    const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
    };

    // Use aggregation with pagination
    const videoAggregate = Video.aggregate(pipeline);
    const videos = await Video.aggregatePaginate(videoAggregate, options);

    // 9️⃣ Send the result as response
    return res.status(200).json(
        new ApiResponse(200, videos, "Videos fetched successfully")
    );
});

// get video, upload to cloudinary, create video 
const publishAVideo = asyncHandler(async (req, res) => {
    const { title, description} = req.body
    
    //check if title or description is missing or only whitespace

    if (!title?.trim() || !description?.trim()) {
        throw new ApiError(400,"Title and Description are required.");
    }

    //Extract file path from the uploaded files (Multer handles these)
    const videoFileLocalPath = req.files?.videoFile?.[0]?.path;
    const thumbnailLocalPath = req.files?.thumbnail?.[0]?.path;

    //Validate if both files are uploaded
    if (!videoFileLocalPath || !thumbnailLocalPath) {
        throw new ApiError(401,"Both video and thumbnail files are required.")
    }

    //upload video to cloudinary
    const uploadVideo = await uplodeOnCloudinary(videoFileLocalPath);
    if ( !updateVideo?.url) {
        throw new ApiError(500, "Failed to upload video to cloud.");
    }

    //uplaod thumbnail to cloudinary
    const uploadThumbnail = await uplodeOnCloudinary(thumbnailLocalPath);
    if (uploadThumbnail?.url) {
        throw new ApiError(500, "Failed to upload thumbnail to cloud.");
    }

    //save video data in MongoDB
    const newVideo = await Video.create({
        title,
        description,
        duration: updateVideo.duration,
        videoFile:{
            url: uploadVideo.url,
            public_id: uploadVideo.public_id
        },
        thumbnail:{
            url: uploadThumbnail.url,
            public_id: uploadThumbnail.public_id
        },
        owner: req.user._id, //user is added by auth middleware
        isPublished: false
    });

    //Double check if the video was created
    if (!newVideo){
         throw new ApiError(500, "Video upload failed. Please try again.");
    }

    res.status(200).json( new ApiResponse(
        200,
        newVideo,
        "Video uploaded successfully"
    ));
});

//get video by id
const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    
    // ✅ Validate videoId format
    if (!isValidObjectId(videoId)){
        throw new ApiError(400,"Invalid videoId");
    }

    // ✅ Validate logged-in user's ID
    const userId = req.user?._id;
    if (!isValidObjectId(userId)) {
      throw new ApiError(400,"invaalid userId");
    }

    // ✅ Fetch video details using MongoDB aggregation
    const video = await Video.aggregate([
        {
              // 🔍 Match the video by ID
            $match:{
                _id:new mongoose.Types.ObjectId(videoId),
            },
        },
        {
            // 👍 Join with likes collection
            $lookup:{
                form:"likes",
                localField:"_id",
                foreignField:"video",
                as:"likes"
            },
        },
        {
            // 👤 Join with users collection (owner of video)
            $lookup:{
                from:"users",
                localField:"owner",
                foreignField:"_id",
                as:"owner",
                pipeline:[
                    {
                          // 📺 Join with subscriptions collection to get subscriber info
                        $lookup:{
                            form:"subscriptions",
                            localField:"_id",
                            foreignField:"channel",
                            as:"subscribers"
                        },
                    },
                    {
                         // ➕ Add subscriber count and whether the current user is subscribed
                         $addFields:{
                            subscribersCount:{
                                $size:"$subscribers"
                            },
                            isSubscribed:{
                                $in:[userId, "$subscribers.subscriber"],
                            },
                         },
                    },

                    {
                         // 🎯 Select only necessary fields from owner
                         $project:{
                            username: 1,
                            "avatar.url":1,
                            subscribersCount:1,
                            isSubscribed: 1,
                         },
                    },

                ],
            }
        },
        {
            // ➕ Add custom fields: likesCount, isLiked, flatten owner
            $addFields:{
                likesCount:{ $size:"$likes"},
                owner:{$first:"$owner"},
                isLiked:{
                    $in:[userId, "$likes.likedBy"],
                }
            }
        },
        {
             // 🧹 Project only needed video fields
             $project:{
                "videoFile.url":1,
                title: 1,
                description: 1,
                views:1,
                createdAt: 1,
                duration:1,
                comments:1,
                owner:1,
                likesCount: 1,
                isLiked: 1,
             }
        }
    ]); 

    // ❌ If video not found, throw error
    if (!video || video.length === 0) {
        throw new ApiError(404, "Video not found");
    }

    // ✅ Increment view count
    await Video.findByIdAndUpdate(videoId,{
        $inc:{ views: 1},
    });

     // 🕒 Add video to user's watch history (avoids duplicates)
     await User.findByIdAndUpdate(userId,{
        $addToSet:{watchHistory:videoId}
     });

      // ✅ Send video data to client
      return res.status(200).json(
        new ApiResponse(200,video[0],"Video details fetched successfully")
      )

});

const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: update video details like title, description, thumbnail
    

})

const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: delete video
})

const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params
})

export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus
}