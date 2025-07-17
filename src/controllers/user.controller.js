import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uplodeOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

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
        "-password -refresToken"
    )

    if (!creadtedUser) {
        throw new ApiError(500, "something went wrong while registering the user || server error")
    }

    return res.status(201).json(
        new ApiResponse(200, creadtedUser, "User Registered Successfully")
    )

} )


export {registerUser}