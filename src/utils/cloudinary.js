import { v2 as cloudinary } from "cloudinary";
import fs from "fs"


cloudinary.config({ 
     cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
     api_key: process.env.CLOUDINARY_API_KEY , 
     api_secret: process.env.CLOUDINARY_API_SECRET
 });

const uplodeOnCloudinary = async (localFilePath) => {
    try {
        if (!localFilePath) return null
        //upload the file on cloudinary
      const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto"
        })
         //file has been uploaded successfull
        //  console.log("file has been uploaded on cloudinary",response.url);
        //  console.log(response);
         fs.unlinkSync(localFilePath)
         return response
            
    } catch (error) {
        fs.unlinkSync(localFilePath) //remove the locally saved file as the upload opration got failed
        return null;
    }
}

// This function deletes an image from Cloudinary
const deleteFromCloudinary = async (fileUrl) => {
    // console.log(fileUrl);
    
    try {
        // Step 1: If no URL is provided, stop here and return null
        if (!fileUrl) return null;

        // Step 2: Break the URL into parts using "/" as a separator
        const urlParts = fileUrl.split("/");

        // Step 3: Get the last 2 parts: folder name and filename
        // Example: ["myfolder", "image.jpg"]
        const folderAndFile = urlParts.slice(-1).join("/");

        // Step 4: Remove the file extension (.jpg, .png, etc.) to get the public_id
        // Example: "myfolder/image"
        const publicId = folderAndFile.replace(/\.[^/.]+$/, "");

        // console.log(publicId);
        

        //  Determine resource type based on file extension
         const extension = fileUrl.split('.').pop().toLowerCase();
        let resourceType = "image";
        if (["mp4", "mov", "avi", "wmv", "flv", "mkv", "webm"].includes(extension)) {
            resourceType = "video";
        }

        // Step 5: Ask Cloudinary to delete the image using the public_id
        const result = await cloudinary.uploader.destroy(publicId, {
            resource_type: resourceType, // tells Cloudinary it's an image file or video
        });
        // console.log(result); 
        

        // Step 6: Return the result (could be success or failure details)
        return result;

    } catch (error) {
        // If something goes wrong, just return null (you can also log the error)
        console.error("Cloudinary delete error:", error);
        return null;
    }
};


export{uplodeOnCloudinary,deleteFromCloudinary}