import mongoose, { isValidObjectId } from "mongoose"
import {Comment} from "../models/comment.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import { Video } from "../models/video.model.js"

// Handle getting comments for a video
const getVideoComments = asyncHandler(async (req, res) => {
   // Get video ID from URL parameters
    const {videoId} = req.params
    
    // Get page number and comments per page from query (default: page 1, 10 comments)
    const {page = 1, limit = 10} = req.query

    // 🛡️ Safety Check #1: Make sure the video ID is in correct format
    if (!isValidObjectId(videoId)) {
        throw new ApiError(400,"Invalid Video ID");
    }

    // 🛡️ Safety Check #2: Verify the video actually exists
    const video = await Video.findById(videoId);
    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    // 🛠️ Start building our smart comment-fetching machine:
    const commentsAggregate = Comment.aggregate([
        // STAGE 1: Filter - Only get comments for this specific video
        {
            $match: {
                video: new mongoose.Types.ObjectId(videoId)
            }
        },
        
        // STAGE 2: Join - Add commenter's profile info
        {
            $lookup: {
                from: "users",              // Look in users collection
                localField: "owner",        // Match comment's owner field
                foreignField: "_id",       // With user's _id field
                as: "ownerDetails",        // Store as ownerDetails array
                pipeline: [                // Only get these user details:
                    {
                        $project: {
                            username: 1,   // Include username
                            fullName: 1,   // Include full name
                            "avatar.url": 1 // Include avatar URL
                        }
                    }
                ]
            }
        },
        
        // STAGE 3: Join - Get all likes for each comment
        {
            $lookup: {
                from: "likes",             // Look in likes collection
                localField: "_id",         // Match comment's _id
                foreignField: "comment",   // With like's comment field
                as: "likes"                // Store as likes array
            }
        },
        
        // STAGE 4: Add New Fields
        {
            $addFields: {
                likesCount: { $size: "$likes" }, // Count total likes
                owner: { $first: "$ownerDetails" }, // Unwrap owner details
                isLiked: {                       // Check if current user liked
                    $in: [req.user?._id, "$likes.likedBy"]
                }
            }
        },
        
        // STAGE 5: Sort - Newest comments first
        {
            $sort: { createdAt: -1 }
        },
        
        // STAGE 6: Select - Only return these fields
        {
            $project: {
                content: 1,     // Comment text
                createdAt: 1,   // When posted
                likesCount: 1,  // Total likes
                owner: 1,       // Commenter's info
                isLiked: 1      // Did current user like this?
            }
        }
    ]);

    // ⏭️ Pagination Setup: Convert strings to numbers
    const options = {
        page: parseInt(page, 10), //Current page number
        limit: parseInt(limit, 10) //Comments per page
    }

    // 🚀 Run the query with pagination
    const comments = await Comment.aggregatePaginate(commentsAggregate, options);

    // 📦 Send back the packaged response
    return res
        .status(200)
        .json(new ApiResponse(200, comments, "Comments fetched successfully"));   

})

// ✅ Controller to add a new comment to a video
const addComment = asyncHandler(async (req, res) => {
    // 👉 Extract the video ID from the URL and comment text from the request body
    const { videoId } = req.params;
    const { content } = req.body;

    // 🛑 Step 1: Check if comment content is empty
    // If user didn't type anything and tried to post — reject it
    if (!content || content.trim() === "") {
        throw new ApiError(400, "Comment content is required");
    }

    // ✅ Step 2: Check if the video actually exists in the database
    // This avoids adding comments to non-existent videos (fake or deleted)
    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    // ✅ Step 3: Add the comment to the database
    // We link the comment to both the video and the user who posted it
    const comment = await Comment.create({
        content: content.trim(),         // Clean up extra spaces from content
        video: video._id,                // Link the comment to the video
        owner: req.user?._id             // The logged-in user is the owner
    });

    // 🛑 Step 4: Just in case something fails while saving
    if (!comment) {
        throw new ApiError(500, "Failed to add comment. Please try again.");
    }

    // ✅ Step 5: Send success response back to the client
    return res
        .status(201) // 201 = "Created successfully"
        .json(new ApiResponse(201, comment, "Comment added successfully"));
});


// ✅ Controller to update a comment's content
const updateComment = asyncHandler(async (req, res) => {
    // 👉 Get the comment ID from the URL and new content from the request body
    const { commentId } = req.params;
    const { content } = req.body;

    // 🛑 Step 1: Make sure user entered some text for the updated comment
    if (!content || content.trim() === "") {
        throw new ApiError(400, "Comment content is required");
    }

    // ✅ Step 2: Find the comment in the database by its ID
    const comment = await Comment.findById(commentId);

    // 🛑 Step 3: If the comment doesn't exist, send a 404 error
    if (!comment) {
        throw new ApiError(404, "Comment not found");
    }

    // 🔐 Step 4: Check if the current logged-in user is the **owner** of this comment
    // We don't allow others to edit your comment
    if (comment.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(403, "Only the comment owner can edit their comment");
    }

    // ✅ Step 5: Update the comment content using its ID
    const updatedComment = await Comment.findByIdAndUpdate(
        comment._id,
        {
            $set: {
                content: content.trim() // clean up extra spaces
            }
        },
        { new: true } // Return the updated document instead of the old one
    );

    // 🛑 Step 6: Double-check if update was successful
    if (!updatedComment) {
        throw new ApiError(500, "Failed to update comment. Please try again.");
    }

    // ✅ Step 7: Return the updated comment to the client
    return res.status(200).json(
        new ApiResponse(200, updatedComment, "Comment updated successfully")
    );
});

// ✅ Controller to delete a comment
const deleteComment = asyncHandler(async (req, res) => {
    const { commentId } = req.params;

    // ✅ Extra safety: Validate MongoDB ID format
    if (!isValidObjectId(commentId)) {
        throw new ApiError(400, "Invalid Comment ID");
    }

    // ✅ Check if comment exists
    const comment = await Comment.findById(commentId);
    if (!comment) {
        throw new ApiError(404, "Comment not found");
    }

    // ✅ Make sure only the owner can delete the comment
    if (comment.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(403, "Only the comment owner can delete this comment");
    }

    // ✅ Delete the comment
    await Comment.findByIdAndDelete(commentId);

    // ✅ Option 1: Delete likes made by the user (more precise)
    await Like.deleteMany({
        comment: commentId,
        likedBy: req.user._id
    });

    // ✅ Option 2: Or delete all likes (less precise, but safe in most cases)
    // await Like.deleteMany({ comment: commentId });

    return res
        .status(200)
        .json(
            new ApiResponse(200, { commentId }, "Comment deleted successfully")
        );
});


export {
    getVideoComments, 
    addComment, 
    updateComment,
     deleteComment
    }