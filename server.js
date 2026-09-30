require("dotenv").config();
const path=require("path");
const express=require("express");
const cors=require("cors");
const mongoose=require("mongoose");

const app=express();
const ALLOWED_ORIGIN=process.env.ALLOWED_ORIGIN||"*";
app.use(cors({origin:ALLOWED_ORIGIN}));
app.use(express.json({limit:"1mb"}));
app.use(express.static(__dirname));

const PORT=parseInt(process.env.PORT,10)||4000;
const MONGO_URI=process.env.MONGODB_URI;

function isDbReady(){return mongoose.connection.readyState===1;}

const UserSchema=new mongoose.Schema({
  clientId:{type:String,required:true,unique:true,index:true},
  name:{type:String,required:true,maxlength:30},
  inviteCode:{type:String,required:true,unique:true,index:true},
  goals:{type:Array,default:[]},
  checks:{type:mongoose.Schema.Types.Mixed,default:{}},
  visits:{type:mongoose.Schema.Types.Mixed,default:{}},
  bestStreak:{type:Number,default:0},
  arcStartDate:{type:String,default:""},
  updatedAt:{type:Date,default:Date.now}
},{timestamps:true});
const User=mongoose.model("User",UserSchema);

function makeCode(){return Math.random().toString(36).slice(2,8).toUpperCase();}
async function uniqueCode(){let c;do{c=makeCode();}while(await User.exists({inviteCode:c}));return c;}

function publicUser(u){
  const visits=Object.keys(u.visits||{}), checks=Object.keys(u.checks||{});
  const today=new Date();
  const key=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const completed=k=>(Array.isArray(u.goals)?u.goals:[]).filter(g=>u.checks?.[`${g.id}_${k}`]).length;
  const qualifies=k=>completed(k)>=1;
  let streak=0,d=new Date();
  while(qualifies(key(d))){streak++;d.setDate(d.getDate()-1);}
  return {id:u._id.toString(),name:u.name,inviteCode:u.inviteCode,streak,bestStreak:Math.max(u.bestStreak||0,streak),updatedAt:u.updatedAt};
}

app.post("/api/users",async(req,res)=>{
  try{
    if(!isDbReady())return res.status(503).json({error:"Database not connected. Operating in local mode.",localMode:true});
    const {clientId,name,arcStartDate}=req.body||{};
    if(!clientId)return res.status(400).json({error:"clientId required"});
    let user=await User.findOne({clientId});
    if(!user){user=await User.create({clientId,name:(name||"Winter Warrior").slice(0,30),inviteCode:await uniqueCode(),arcStartDate:typeof arcStartDate==="string"?arcStartDate:""});}
    else if(name)user.name=String(name).slice(0,30);
    await user.save();
    res.json({clientId:user.clientId,name:user.name,inviteCode:user.inviteCode,id:user._id.toString()});
  }catch(e){res.status(500).json({error:e.message});}
});

app.put("/api/users/:clientId/progress",async(req,res)=>{
  try{
    if(!isDbReady())return res.status(503).json({error:"Database not connected. Operating in local mode.",localMode:true});
    const user=await User.findOne({clientId:req.params.clientId});
    if(!user)return res.status(404).json({error:"User not found"});
    const {name,goals,checks,visits,bestStreak,arcStartDate}=req.body;
    if(name)user.name=String(name).slice(0,30);
    if(Array.isArray(goals))user.goals=goals;
    if(checks&&typeof checks==="object")user.checks=checks;
    if(visits&&typeof visits==="object")user.visits=visits;
    if(Number.isFinite(bestStreak))user.bestStreak=bestStreak;
    if(typeof arcStartDate==="string")user.arcStartDate=arcStartDate.slice(0,10);
    user.updatedAt=new Date(); await user.save(); res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message});}
});

app.get("/api/users/:id/public",async(req,res)=>{
  try{
    if(!isDbReady())return res.status(503).json({error:"Database not connected."});
    const u=await User.findById(req.params.id);
    if(!u)return res.status(404).json({error:"Not found"});
    res.json(publicUser(u));
  }
  catch{res.status(404).json({error:"Not found"});}
});

app.get("/api/invites/:code",async(req,res)=>{
  try{
    if(!isDbReady())return res.status(503).json({error:"Database not connected."});
    const u=await User.findOne({inviteCode:req.params.code.toUpperCase()});
    if(!u)return res.status(404).json({error:"Invite not found"});
    res.json(publicUser(u));
  }
  catch{res.status(404).json({error:"Invite not found"});}
});

app.get("/api/health",(req,res)=>res.json({ok:true,database:isDbReady()}));

app.use((err,req,res,next)=>{
  if(err instanceof SyntaxError && err.status===400 && "body" in err){
    return res.status(400).json({error:"Invalid JSON"});
  }
  res.status(500).json({error:"Server error"});
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"index.html")));

async function start(){
  if(!MONGO_URI){
    console.warn("MONGODB_URI is missing. Frontend works in local mode; sharing is disabled.");
  }else{
    try{
      await mongoose.connect(MONGO_URI);
      console.log("MongoDB connected successfully");
    }catch(e){
      console.error("MongoDB connection failed:",e.message);
    }
  }

  function listen(port){
    const server=app.listen(port,"0.0.0.0",()=>{
      console.log(`Winter Arc running at http://localhost:${port}`);
    });
    server.on("error",(err)=>{
      if(err.code==="EADDRINUSE"){
        const nextPort=port+1;
        console.warn(`Port ${port} is in use, trying port ${nextPort}...`);
        listen(nextPort);
      }else{
        console.error("Server error:",err.message);
      }
    });
  }

  listen(PORT);
}
start();
