import mongoose, { isValidObjectId } from "mongoose"
import {Tweet} from "../models/tweet.model.js"
import {User} from "../models/user.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"

// ✅ Controller to create a new tweet
const createTweet = asyncHandler(async (req, res) => {
    // STEP 1️⃣: Get tweet content from the request body
    const { content } = req.body;

    // STEP 2️⃣: Check if the tweet is empty or just spaces
    // We don't want users to create blank tweets
    /* if (!content?.trim()) {
    throw new ApiError(400, "Tweet content cannot be empty");
     } same logic diffrent approach*/
    if (!content || content.trim() === "") {
        throw new ApiError(400, "Tweet content cannot be empty");
    }

    // STEP 3️⃣: Create a new tweet in the database
    // The 'owner' of the tweet is the currently logged-in user (set by the auth middleware)
    const newTweet = await Tweet.create({
        content: content.trim(), // Trim extra spaces from content
        owner: req.user._id      // Set the tweet's owner to the user's ID
    });

    // STEP 4️⃣: Double-check if tweet creation was successful
    // This is an extra safety step — usually not needed but helpful in rare DB failures
    if (!newTweet) {
        throw new ApiError(500, "Something went wrong. Please try again.");
    }

    // STEP 5️⃣: Send back a success response with the created tweet
    return res.status(201).json(
        new ApiResponse(201, newTweet, "Tweet created successfully")
    );
});

// ✅ Controller to get all tweets for a specific user
const getUserTweets = asyncHandler(async (req, res) => {
    // 👉 Step 1: Extract user ID from URL parameters
    // Example: /api/tweets/user/123 → userId = "123"
    const { userId } = req.params;

    // 🛑 Step 2: Validate the user ID format
    // Prevents database errors from malformed IDs
    if (!isValidObjectId(userId)) {
        throw new ApiError(400, "Invalid user ID");
    }

    // 🛠️ Step 3: Build the tweet-fetching pipeline
    // Think of this as an assembly line for processing data
    const tweets = await Tweet.aggregate([
        // 🔎 STAGE 1: Filtering - Only get tweets by this user
        // Like searching a filing cabinet for one person's documents
        {
            $match: {
                owner: new mongoose.Types.ObjectId(userId), // Convert string to MongoDB ID
            },
        },

        // 🤝 STAGE 2: First Join - Get the tweeter's profile info
        // Like attaching a sticky note with author details to each tweet
        {
            $lookup: {
                from: "users",         // Search in the users collection
                localField: "owner",   // Tweet's owner field
                foreignField: "_id",   // User's ID field
                as: "ownerDetails",    // Store results here (as array)
                pipeline: [           // Only get these specific fields:
                    {
                        $project: {
                            username: 1,      // Keep username
                            "avatar.url": 1,  // Keep avatar URL
                        },
                    },
                ],
            },
        },

        // ❤️ STAGE 3: Second Join - Get all likes for these tweets
        // Like counting how many people hearted each tweet
        {
            $lookup: {
                from: "likes",        // Search in likes collection
                localField: "_id",    // Tweet's ID
                foreignField: "tweet",// Like's tweet reference
                as: "likeDetails",    // Store all likes here
            },
        },

        // ✨ STAGE 4: Add New Fields - Create easier-to-use data
        // Like adding summary post-it notes to each document
        {
            $addFields: {
                likesCount: {
                    $size: "$likeDetails", // Count total likes (array length)
                },
                owner: {
                    $first: "$ownerDetails", // Unwrap from array to object
                },
                isLiked: {
                    // Check if current user's ID exists in likers list
                    $in: [req.user?._id, "$likeDetails.likedBy"],
                },
            },
        },

        // ⏰ STAGE 5: Sorting - Newest tweets first
        // Like arranging papers with newest on top
        {
            $sort: {
                createdAt: -1 // -1 = descending (newest first)
            }
        },

        // 🎨 STAGE 6: Final Touch - Select only needed fields
        // Like packing only essentials for delivery
        {
            $project: {
                content: 1,    // Keep tweet text
                owner: 1,      // Keep author info
                likesCount: 1, // Keep like count
                createdAt: 1,  // Keep post time
                isLiked: 1,    // Keep liked status
                _id: 1         // Keep tweet ID
            },
        },
    ]);

    // 📦 Step 4: Send the neatly packaged result to client
    return res.status(200).json(
        new ApiResponse(200, tweets, "User tweets fetched successfully")
    );
});

// ✅ Controller to update an existing tweet
const updateTweet = asyncHandler(async (req, res) => {
    //TODO: update tweet
    // 👉 Get the tweet ID from URL and new content from the body
    const { tweetId } = req.params;
    const { content } = req.body;

    // 🛑 Validate the tweet ID
    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid tweet ID");
    }

    // 🛑 Check if the new content is empty
    if (!content || content.trim() === "") {
        throw new ApiError(400, "Tweet content cannot be empty");
    }

    // ✅ Find the tweet to be updated
    const tweet = await Tweet.findById(tweetId);

    // 🛑 If the tweet doesn't exist, throw a 404 error
    if (!tweet) {
        throw new ApiError(404, "Tweet not found");
    }

    // 🔐 Check if the person trying to update the tweet is the actual owner
    if (tweet.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(403, "You are not authorized to update this tweet");
    }

    // ✅ Find the tweet by its ID and update its content
    const updatedTweet = await Tweet.findByIdAndUpdate(
        tweetId,
        {
            $set: {
                content,
            },
        },
        { new: true } // This option returns the updated document
    );

    // 🛑 If the update failed, throw an error
    if (!updatedTweet) {
        throw new ApiError(500, "Failed to update tweet. Please try again.");
    }

    // ✅ Send the updated tweet back to the client
    return res
        .status(200)
        .json(new ApiResponse(200, updatedTweet, "Tweet updated successfully"));
})

// ✅ Controller to delete a tweet
const deleteTweet = asyncHandler(async (req, res) => {
    //TODO: delete tweet
    // 👉 Get the tweet ID from the URL parameters
    const { tweetId } = req.params;

    // 🛑 Validate the tweet ID
    if (!isValidObjectId(tweetId)) {
        throw new ApiError(400, "Invalid tweet ID");
    }

    // ✅ Find the tweet to be deleted
    const tweet = await Tweet.findById(tweetId);

    // 🛑 If the tweet doesn't exist, throw a 404 error
    if (!tweet) {
        throw new ApiError(404, "Tweet not found");
    }

    // 🔐 Check if the person trying to delete the tweet is the owner
    if (tweet.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(403, "You are not authorized to delete this tweet");
    }

    // ✅ Delete the tweet from the database
    await Tweet.findByIdAndDelete(tweetId);

    // 🧹 Clean up: also delete all the likes associated with this tweet
    await Like.deleteMany({ tweet: tweetId });

    // ✅ Send a success response to the client
    return res
        .status(200)
        .json(new ApiResponse(200, { tweetId }, "Tweet deleted successfully"));
})

export {
    createTweet,
    getUserTweets,
    updateTweet,
    deleteTweet
}