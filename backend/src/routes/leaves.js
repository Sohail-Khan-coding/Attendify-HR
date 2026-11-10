const router = require('express').Router();
const Leave = require('../models/Leave');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');
const { countDays } = require('../utils/dates');
router.use(protect);
router.post('/', async (req,res)=>{
  try {
    const {type,startDate,endDate,reason}=req.body;
    const days=countDays(startDate,endDate); if(!Number.isFinite(days)||days<1||days>366) return res.status(400).json({message:'Please select valid leave dates.'});
    if(new Date(startDate)>new Date(endDate)) return res.status(400).json({message:'End date must be after start date.'});
    const overlap=await Leave.findOne({employee:req.user._id,status:{$in:['pending','approved']},startDate:{$lte:new Date(endDate)},endDate:{$gte:new Date(startDate)}});
    if(overlap) return res.status(409).json({message:'A leave request already exists for these dates.'});
    const row=await Leave.create({employee:req.user._id,type,startDate,endDate,days,reason}); res.status(201).json(row);
  } catch(e){res.status(400).json({message:e.message});}
});
router.get('/mine', async(req,res)=>res.json(await Leave.find({employee:req.user._id}).sort({createdAt:-1})));
router.get('/balance', async(req,res)=>{
  const year=new Date().getFullYear(); const approved=await Leave.find({employee:req.user._id,status:'approved',startDate:{$gte:new Date(`${year}-01-01`),$lte:new Date(`${year}-12-31`)}});
  const used={annual:0,sick:0,casual:0}; approved.forEach(l=>{if(used[l.type]!==undefined) used[l.type]+=l.days;});
  const allowance=req.user.leaveAllowance||{}; const result={}; ['annual','sick','casual'].forEach(k=>result[k]={entitled:allowance[k]||0,used:used[k],remaining:Math.max((allowance[k]||0)-used[k],0)}); res.json(result);
});
router.get('/admin/all',adminOnly,async(req,res)=>res.json(await Leave.find().populate('employee','name employeeId department').sort({createdAt:-1})));
router.patch('/admin/:id/review',adminOnly,async(req,res)=>{
  const {status,adminRemark}=req.body; if(!['approved','rejected'].includes(status)) return res.status(400).json({message:'Invalid decision.'});
  const leave=await Leave.findById(req.params.id); if(!leave) return res.status(404).json({message:'Request not found.'});
  if(leave.status!=='pending') return res.status(409).json({message:'This request has already been reviewed.'});
  if(status==='approved' && leave.type!=='unpaid'){
    const employee=await User.findById(leave.employee); const used=await Leave.aggregate([{$match:{employee:leave.employee,status:'approved',type:leave.type,startDate:{$gte:new Date(`${new Date().getFullYear()}-01-01`)}}},{$group:{_id:null,total:{$sum:'$days'}}}]);
    const allowance=(employee.leaveAllowance||{})[leave.type]||0; if((used[0]?.total||0)+leave.days>allowance) return res.status(400).json({message:'Insufficient leave balance. Update employee allowance or reject this request.'});
  }
  leave.status=status; leave.adminRemark=adminRemark||''; leave.reviewedBy=req.user._id; await leave.save(); res.json(leave);
});
module.exports=router;
