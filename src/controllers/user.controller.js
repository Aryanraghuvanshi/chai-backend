import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uplodeOnCloudinary,deleteFromCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from 'jsonwebtoken'
import mongoose from "mongoose";


const generateAccessAndRefreshToken = async(userId)=>{
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({validateBeforeSave: false})
        
        
        return {accessToken , refreshToken}

    } catch (error) {
        throw new ApiError(500, "someting went wrong while generating refresh and access token")
    }

}

const registerUser = asyncHandler( async (req,res) =>{
    //get user details from frontend
    // validation - not empty
    //check if user already exists: username, email
    //check for images , check for avatar
    //upload them to cloudinary, avtar
    // create user object - create entry in db
    // remove password and refresh token field from response
    // check for user creation
    // return res


    const {fullName, email, username, password} = req.body
    // console.log("email", email,fullName,username,password);
    // console.log(req.body);
    

    // if(fullName === ""){
    //     throw new ApiError(400, "fullname is required")
    // }

    if (
        [fullName, email ,username ,password].some((field)=> field?.trim() === "")
    )  {
        throw new ApiError(400, "All fields are required")
    }

    const exitedUser = await User.findOne({
        $or: [{ username }, { email }]
    })

    if(exitedUser){
        throw new ApiError(409, "User with email or username already existed")
    }
    // console.log(req.files);
    
    const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;


    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0]?.path
    }
/*  //typeo error check in case of undefine or null
      let coverImage = null;

if (coverImageLocalPath) {
  coverImage = await uplodeOnCloudinary(coverImageLocalPath);

  if (!coverImage || !coverImage.url) {
    console.log("Cover image upload failed or returned null");
    coverImage = { url: "" }; // fallback so it doesn't crash
  }
} else {
  coverImage = { url: "" }; // No image provided, use empty
}
*/
    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file is required")
    }

    const avatar = await uplodeOnCloudinary(avatarLocalPath)
    const coverImage = await uplodeOnCloudinary(coverImageLocalPath)
  


    if(!avatar){
        throw new ApiError(400, "Avatar file is required")
    }

    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })

    const creadtedUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if (!creadtedUser) {
        throw new ApiError(500, "something went wrong while registering the user || server error")
    }

    return res.status(201).json(
        new ApiResponse(200, creadtedUser, "User Registered Successfully")
    )

} )

const loginUser = asyncHandler(async (req,res) =>{
    //req body -> data
    //username or email
    //find the user in db 
    //password check
    //access and refresh token
    //send cookies 

    const {email, username, password} = req.body;

    // if(!(username || email)){
    //     throw new ApiError(400,"username or email is required")
    // }
    //this will throw ERROR IF WE DO CODE LIKE (!username || !email)
    if(!username && !email){
        throw new ApiError(400,"username or email is required")
    }

    const user = await User.findOne({
        $or :[{username}, {email}]
    })

    if (!user){
        throw new ApiError(404, "User does not exist")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)

    if (!isPasswordValid){
        throw new ApiError(401, "Invalid user credentials")
    }

    const {accessToken,refreshToken} = await generateAccessAndRefreshToken(user._id)

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .cookie("accessToken",accessToken, options)
    .cookie("refreshToken",refreshToken, options)
    .json(
        new ApiResponse (
             200,
             {
                user: loggedInUser, accessToken,
                refreshToken
             },
             "User logged In Succesfully"
            )
    )

})

const logoutUser = asyncHandler(async(req,res)=>{
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: {
                refreshToken: 1 // this removes the field from document
            }
        },
        {
            new: true
        }
    )


     const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out"))

})

const refreshAccessToken = asyncHandler(async (req,res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if (!incomingRefreshToken) {
        throw new ApiError(401, "unauthorized request") 
    }

   try {
     const decodedToken = jwt.verify(
         incomingRefreshToken,
         process.env.REFRESH_TOKEN_SECRET
     )
 
     const user = await User.findById(decodedToken?._id)
 
     if (!user) {
         throw new ApiError(401, "Invalid refresh token") 
     }
 
     if (incomingRefreshToken !== user?.refreshToken){
         throw new ApiError("Refresh token is expired or used");
     }
 
     const options ={
         httpOnly:true,
         secure:true
     }
 
     const {accessToken,newRefreshToken} = await generateAccessAndRefreshToken(user._id)
 
     return res
     .status(200)
     .cookie("accessToken",accessToken,options)
     .cookie("refreshToken",newRefreshToken,options)
     .json(
         new ApiResponse(
             200,
             {accessToken , refreshToken: newRefreshToken},"Access token refreshed"
         )
     )
   } catch (error) {
     throw new ApiError(401, error?.message || "invalid refresh token")
   }
})

const changeCurrentPassword = asyncHandler(async (req,res)=>{
    const {oldPassword, newPassword} = req.body

    const user = await User.findById(req.user?._id)
    const isPasswordCorrect =  await user.isPasswordCorrect(oldPassword)

    if (!isPasswordCorrect) {
        throw new ApiError(400,"Invalid old password")
    }

    user.password = newPassword
    await user.save({validateBeforeSave: false})

    return res
    .status(200)
    .json(new ApiResponse(200,{},"password changed successfully"))
}) 

const getCurrentUser = asyncHandler(async(req,res)=>{
    return res
    .status(200)
    .json(new ApiResponse(200, req.user,"current user fetched successfully"))
})

const updateAccountDetails = asyncHandler(async(req,res)=>{
    const {fullName, email} = req.body

    if (!(fullName || email)) {
        throw  new ApiError(400, "All fields are required")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                fullName,
                // email: email
                email,
            }
        },
        {new : true}
    ).select("-password") 

    return res
    .status(200)
    .json( new ApiResponse(200, user , "Account details updated successfully"))
})

const updateUserAvatar = asyncHandler(async(req,res)=>{
    const avatarLocalpath = req.file?.path

    if (!avatarLocalpath) {
        throw new ApiError(400,"Avatar file is missing")
    }

    const avatar = await uplodeOnCloudinary(avatarLocalpath)

     if (!avatar.url) {
        throw new ApiError(400,"Error while uploading on avatar")
    }
  
     // Delete old avatar image from Cloudinary
    const userData = await User.findById(req.user?._id).select("avatar");
    try {
    if (userData?.avatar) {
        await deleteFromCloudinary(userData.avatar);
    }
} catch (err) {
    console.warn("Failed to delete old avatar:", err.message);
}

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                avatar: avatar.url
            }
        },
        {new: true}
    ).select("-password")

        return res.status(200).json( new ApiResponse(200, user,"avatar image updated successfully"))
})

const updateUserCoverImage = asyncHandler(async(req,res)=>{
    const coverImageLocalpath = req.file?.path

    if (!coverImageLocalpath) {
        throw new ApiError(400,"cover image file is missing")
    }

    const coverImage = await uplodeOnCloudinary(coverImageLocalpath)

     if (!coverImage.url) {
        throw new ApiError(400,"Error while uploading on cover image")
    }


        // Delete old coverImage image from Cloudinary
    const userData = await User.findById(req.user?._id).select("coverImage");
    try {
    if (userData?.coverImage) {
        await deleteFromCloudinary(userData.coverImage);
    }
} catch (err) {
    console.warn("Failed to delete old coverImage:", err.message);
}

 const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                coverImage: coverImage.url
            }
        },
        {new: true}
    ).select("-password")

    return res.status(200).json( new ApiResponse(200, user,"cover image updated successfully"))

})

const getUserChannelProfile = asyncHandler(async(req,res)=>{
    const {username} = req.params

    if (!username?.trim()) {
        throw new ApiError(400,"username is missing in getchannelprofile")
    }

    // User.find({username})
    const channel = await User.aggregate([
        {
            $match:{
                username: username?.toLowerCase()
            }
        },
        {
            $lookup:{
                from: "subscriptions",
                localField:"_id",
                foreignField:"channel",
                as:"subscribers"
            }
        },
        {
            $lookup:{
                from: "subscriptions",
                localField:"_id",
                foreignField:"subscriber",
                as:"subscribedTo"
            }
        },
        {
            $addFields:{
                subscribersCount: {
                    $size: "$subscribers"
                },
                channelsSubscriberToCount:{
                    $size: "$subscribedTo"
                },
                isSubscribed:{
                    $cond: {
                        if: {$in: [req.user?._id,"$subscribers.subscriber"]},
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project:{
                fullName: 1,
                username: 1,
                subscribersCount:1,
                channelsSubscriberToCount:1,
                isSubscribed:1,
                avatar:1,
                coverImage:1,
                email:1
            }
        }
    ])

    // console.log(channel);

    if (!channel?.length){
        throw new ApiError(404,"channel does not exist")
    }

    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            channel[0],
            "User channe fetched successfully"
        )
    )

})


const getWatchHistory = asyncHandler(async(req,res)=>{
    const user = await User.aggregate([
        {
            $match:{
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup:{
                from:"videos",
                localField:"watchHistory",
                foreignField:"_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup:{
                            from:"users",
                            localField:"owner",
                            foreignField:"_id",
                            as: "owner",
                            pipeline:[
                                {
                                    $project:{
                                        fullName: 1,
                                        username:1,
                                        avatar:1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields:{
                            owner:{
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])

    return res
    .status(200)
    .json(new ApiResponse (200,user[0].watchHistory,"watch history fetched successfully"))
})

export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
}