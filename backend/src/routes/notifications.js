const router = require('express').Router();
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const NotificationSubscription = require('../models/NotificationSubscription');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');
const { deliverNotification, pushReady } = require('../utils/notifications');
const { writeAudit } = require('../utils/audit');

router.get('/push/public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '', enabled: pushReady() });
});

router.use(protect);

router.get('/', async (req, res, next) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ recipient: req.user._id }).sort({ createdAt: -1 }).limit(50).lean(),
      Notification.countDocuments({ recipient: req.user._id, readAt: null })
    ]);
    res.json({ notifications, unreadCount });
  } catch (error) { next(error); }
});

router.patch('/read-all', async (req, res, next) => {
  try {
    await Notification.updateMany({ recipient: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
    res.json({ message: 'Notifications marked as read.' });
  } catch (error) { next(error); }
});

router.post('/push/subscription', async (req, res, next) => {
  try {
    const { endpoint, keys } = req.body;
    if (!pushReady()) return res.status(503).json({ message: 'Device notifications are not configured on the server.' });
    if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ message: 'A valid browser push subscription is required.' });
    }

    await NotificationSubscription.findOneAndUpdate(
      { endpoint },
      { $set: { user: req.user._id, endpoint, keys } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    req.user.notificationPreferences.push = true;
    await req.user.save();
    res.json({ message: 'This device is subscribed to notifications.', notificationPreferences: req.user.notificationPreferences });
  } catch (error) { next(error); }
});

router.delete('/push/subscription', async (req, res, next) => {
  try {
    const endpoint = req.body?.endpoint;
    if (endpoint) await NotificationSubscription.deleteOne({ user: req.user._id, endpoint });
    else await NotificationSubscription.deleteMany({ user: req.user._id });
    const remainingSubscription = await NotificationSubscription.exists({ user: req.user._id });
    if (!remainingSubscription) {
      req.user.notificationPreferences.push = false;
      await req.user.save();
    }
    res.json({ message: 'Device notifications disabled.', pushEnabled: Boolean(remainingSubscription) });
  } catch (error) { next(error); }
});

router.post('/announcements', adminOnly, async (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim().slice(0, 120);
    const message = String(req.body.message || '').trim().slice(0, 500);
    if (!title || !message) return res.status(400).json({ message: 'Announcement title and message are required.' });

    const employees = await User.find({ role: 'employee', active: true }).select('_id notificationPreferences');
    await Promise.all(employees.map(employee => {
      if (employee.notificationPreferences?.announcements === false) return null;
      return deliverNotification(employee._id, { title, message, category: 'announcement', link: '/' });
    }));
    await writeAudit({ req, action: 'announcement.created', entityType: 'announcement', summary: `Published announcement: ${title}` });
    res.status(201).json({ message: `Announcement sent to ${employees.length} active employees.` });
  } catch (error) { next(error); }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ message: 'Notification not found.' });
    const row = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { $set: { readAt: new Date() } },
      { new: true }
    );
    if (!row) return res.status(404).json({ message: 'Notification not found.' });
    res.json(row);
  } catch (error) { next(error); }
});

module.exports = router;
