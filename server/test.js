import mongoose from "mongoose";

const uri = "mongodb+srv://gumza325_db_user:5Wjlvsq5D2B9noL2@cluster0.nm57rvf.mongodb.net/?appName=Cluster0"; // paste your link here

mongoose.connect(uri)
  .then(() => {
    console.log("✅ Connected to MongoDB");
  })
  .catch((err) => {
    console.log("❌ Error:", err.message);
  });