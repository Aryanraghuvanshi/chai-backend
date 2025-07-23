import mongoose , {Schema} from "mongoose";


const platlistSchema = new Schema(
    {
        name:{
            type:string,
            required:true
        },
        description:{
            type:string,
            required:true
        },
        video:[
            {
                type:Schema.Types.ObjectId,
                ref:Video
            }
        ],
        owner:{
            type:Schema.Types.ObjectId,
            ref:User
        }
    },
    {
        timestamps:true
    }
)


export const Playlist = mongoose.model("Playlist",platlistSchema)