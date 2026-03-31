import mongoose from "mongoose"

export const productSchema = new mongoose.Schema({
    productName:{
        type:String,
        required:true,
        index:true
    },
    description:{
        type:String,
        required:true,
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
        required: true,
    },
    subcategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Subcategory"
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
});

export default mongoose.model("Product", productSchema);
