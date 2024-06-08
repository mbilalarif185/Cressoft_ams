import express from "express";
const app=express();
const port = 9000;
app.use('/',(req,res)=>{
    res.send(" Hey I am deploying it on Vercel")
})
app.listen(9000,()=>{
    console.log('Server is running on port:', port);
}); 