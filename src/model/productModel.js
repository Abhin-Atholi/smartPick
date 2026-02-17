const mongoose= require("mongoose")

const productSchema= new mongoose.model({
    productName:{
        type:String,
        required:true,
        index:true
    },
    description:{
        type:String,
        required:true,
    },
    status:{
        type:String,
        enum:["active","inactive"],
        default:"active"
    },
    basePrice:{
        type:Number,
        required:true
    },
    currentPrice:{
        type:Number,
    }
})