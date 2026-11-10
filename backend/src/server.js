require('dotenv').config();
const express=require('express'); const cors=require('cors'); const morgan=require('morgan'); const path=require('path');
const connectDB=require('./config/db');
const app=express(); app.use(cors({origin:process.env.CLIENT_URL||'http://localhost:4200'})); app.use(express.json({limit:'1mb'})); app.use(morgan('dev'));
// Uploaded files are deliberately not exposed as a public static directory. Add an authenticated photo-serving route before production use.
app.get('/api/health',(req,res)=>res.json({status:'ok',app:'Attendify HR API'}));
app.use('/api/auth',require('./routes/auth')); app.use('/api/employees',require('./routes/employees')); app.use('/api/attendance',require('./routes/attendance')); app.use('/api/leaves',require('./routes/leaves'));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({message:'Unexpected server error.'});});
const port=process.env.PORT||5000;
connectDB().then(()=>app.listen(port,()=>console.log(`Attendify API running on ${port}`))).catch(err=>{console.error('Database connection failed:',err.message);process.exit(1);});
