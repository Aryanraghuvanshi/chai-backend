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

const toggleCommentLike = asyncHandler(async (req, res) => {
    const {commentId} = req.params
    //TODO: toggle like on comment

})

const toggleTweetLike = asyncHandler(async (req, res) => {
    const {tweetId} = req.params
    //TODO: toggle like on tweet
}
)

const getLikedVideos = asyncHandler(async (req, res) => {
    //TODO: get all liked videos
})

export {
    toggleCommentLike,
    toggleTweetLike,
    toggleVideoLike,
    getLikedVideos
}