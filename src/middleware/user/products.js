import Product from "../../model/productModel.js"

export const checkProductIsBlocked=async (req,res,next)=>{
    try{
        const productIsActive= await Product.findOne({_id:req.params.id})
        console.log(req.params.id)
        console.log(productIsActive.isActive)
        if(!productIsActive.isActive) return res.redirect("/?msg=The item is currently unavailable")
        else next()
    }
    catch(err){
        console.log(err)
    }
}

