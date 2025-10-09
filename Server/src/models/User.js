import mongoose from "mongoose";
const schema = new mongoose.Schema({
  username: { type:String, unique:true, index:true },
  passwordHash: String,
  email: String, fullName: String, gender: String, birthdate: String, address: String, phone: String
}, { timestamps:true });
export const User = mongoose.model("User", schema);
