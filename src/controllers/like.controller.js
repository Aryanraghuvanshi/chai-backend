import mongoose, {isValidObjectId} from "mongoose"
import {Like} from "../models/like.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

// Controller to like or unlike a video
const toggleVideoLike = asyncHandler(async (req, res) => {
    const {videoId} = req.params

    // 1. Validate videoId format
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400,"Invalid video Id");
    }

    // 2. Check if the video is already liked by this user
    const existingLike = await Like.findOne({
        video:videoId,
        likedBy:req.user._id,
    });
    console.log(existingLike);
    
     // 3. If already liked, remove the like (unlike the video)
    if(existingLike){
        await existingLike.deleteOne();

        return res.status(200).json(
        new ApiResponse(200, { isLiked: false }, "Video unliked successfully")
    );
    }

     // 4. If not liked yet, create a new like
     await Like.create({
        video:videoId,
        likedBy:req.user._id,
     });

     
  return res.status(200).json(
    new ApiResponse(200, { isLiked: true }, "Video liked successfully")
  );

})

// Controller to like or unlike a comment
const toggleCommentLike = asyncHandler(async (req, res) => {
    const {commentId} = req.params
    // 1. Check if the commentId is a valid MongoDB ObjectId
    if (!isValidObjectId(commentId)) {
        throw new ApiError(400,"Invalid comment ID")
    }

    // 2. Check if the user has already liked this comment
    const existingLike = await Like.findOne({
        comment: commentId,
        likedBy: req.user._id
    })

    // 3. If already liked, remove the like (unlike)
    if (existingLike) {
        await existingLike.deleteOne();

        return res.status(200).json(
      new ApiResponse(200, { isLiked: false }, "Comment unliked successfully")
        );
    }

    // 4. If not liked yet, add a new like
    await Like.create({
        comment:commentId,
        likedBy: req.user._id,
    })

    return res.status(200)
    .json( new ApiResponse(200,{isLiked:true},"Comment liked successfully")
    );
});

// Controller to like or unlike a tweet
const toggleTweetLike = asyncHandler(async (req, res) => {
    const {tweetId} = req.params
    
    // 1. Validate if tweetId is a valid MongoDB ObjectId
    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400,"Invalid tweet ID")
    }

    // 2. Check if the user already liked this tweet
    const existingLike = await Like.findOne({
        tweet: tweetId,
        likedBy: req.user._id,
    })

    // 3. If already liked, remove the like (unlike it)
    if (existingLike) {
       await existingLike.deleteOne();

    return res.status(200).json(
    new ApiResponse(200,
    { tweetId, isLiked: false },
    "Tweet unliked successfully")
    );
  }

    // 4. If not liked yet, add a like
    await Like.create({
        tweet:tweetId,
        likedBy:req.user._id
    })

      return res.status(200).json(
    new ApiResponse(
      200,
      { tweetId, isLiked: true },
      "Tweet liked successfully"
    )
  );
})

// get all liked videos
const getLikedVideos = asyncHandler(async (req, res) => {
    const likedVideosAggregate = await Like.aggregate([
        // Step 1: Match only likes by the current logged-in user
        {
            $match:{
                likedBy: new mongoose.Types.ObjectId(req.user?._id),
            },
        },

        // Step 2: Join with the "videos" collection using the "video" field in Like
        {
            $lookup:{
                from:"videos",
                localField:"video",
                foreignField:"_id",
                as:"likedVideo",

                 // Step 3: While joining, also join the video owner (user)
                 pipeline:[
                    {
                        $lookup:{
                            from:"users",
                            localField:"owner",
                            foreignField:"_id",
                            as:"ownerDetails",
                        },
                    },
                    {
                         // Since ownerDetails is an array, we flatten it to a single object

                        $unwind: "$ownerDetails",
                    },
                 ],
            },
        },
        // Step 4: Flatten the likedVideo array to access its fields easily
        {
            $unwind:"$likedVideo"
        },
        // Step 5: Sort liked videos by the time the like was created (latest first)
        {
            $sort:{
                createdAt: -1,
            },
        },
        // Step 6: Select only the necessary fields to return to the user
        {
            $project:{
                _id: 0, //Hide the Like document's own _id
                likedVideo:{
                    _id:1,
                    "videoFile.url":1,
                    "thumbnail.url":1,
                    title: 1,
                    description: 1,
                    views: 1,
                    duration: 1,
                    createdAt: 1,
                    isPublished: 1,
                    owner: 1, // Just in case you use owner ID somewhere

                    // Include selected owner fields
                    ownerDetails: {
                        username: 1,
                        fullName: 1,
                        "avatar.url": 1,
                    },
                },
            },
        } ,
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            likedVideosAggregate,
            "Liked videos fetched successfully"
        )
    );
})

export {
    toggleCommentLike,
    toggleTweetLike,
    toggleVideoLike,
    getLikedVideos
}