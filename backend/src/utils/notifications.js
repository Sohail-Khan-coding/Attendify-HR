const webpush = require('web-push');
const Notification = require('../models/Notification');
const NotificationSubscription = require('../models/NotificationSubscription');
const User = require('../models/User');

function pushReady() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function configureWebPush() {
  if (!pushReady()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@attendify.local',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  return true;
}

function preferenceFor(category) {
  if (category === 'leave') return 'leaveUpdates';
  if (category === 'attendance' || category === 'correction') return 'attendanceReminder';
  if (category === 'announcement') return 'announcements';
  return null;
}

async function deliverNotification(recipient, data) {
  const notification = await Notification.create({ recipient, ...data });
  if (!configureWebPush()) return notification;

  const user = await User.findById(recipient).select('notificationPreferences');
  const preference = preferenceFor(data.category);
  if (!user || user.notificationPreferences?.push === false || (preference && user.notificationPreferences?.[preference] === false)) {
    return notification;
  }

  const subscriptions = await NotificationSubscription.find({ user: recipient });
  const payload = JSON.stringify({
    id: notification._id,
    title: notification.title,
    body: notification.message,
    url: notification.link || '/'
  });

  await Promise.all(subscriptions.map(async subscription => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: subscription.keys
      }, payload);
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await NotificationSubscription.deleteOne({ _id: subscription._id });
      } else {
        console.error('Push delivery failed:', error.statusCode || error.message);
      }
    }
  }));

  return notification;
}

async function notifyUser(userOrId, data) {
  const user = typeof userOrId === 'object' && userOrId.notificationPreferences
    ? userOrId
    : await User.findById(userOrId).select('notificationPreferences');
  if (!user) return null;
  return deliverNotification(user._id, data);
}

async function notifyRoles(roles, data) {
  const users = await User.find({ role: { $in: roles }, active: true }).select('_id notificationPreferences');
  return Promise.all(users.map(user => notifyUser(user, data)));
}

module.exports = { deliverNotification, notifyUser, notifyRoles, pushReady };
