import express from "express";
const app=express();
const port = 9000;
app.use('/',()=>{
    res.json({message:" Hey I am deploying it on Vercel"})
})
app.listen(9000,()=>{
    console.log('Server is running on port:', port);
}); 