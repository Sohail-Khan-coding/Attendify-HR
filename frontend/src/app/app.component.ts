
import { Component, HostListener, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import * as QRCode from 'qrcode';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html'
})
export class AppComponent implements OnDestroy {
  api = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'
    : 'https://attendify-hr.vercel.app/api';

  token = localStorage.getItem('attendify_token') || '';
  user: any = JSON.parse(localStorage.getItem('attendify_user') || 'null');

  page = 'dashboard';
  menuOpen = false;
  busy = false;
  mfaRequired = false;
  mfaChallengeToken = '';
  mfaCode = '';
  mfaSetupPassword = '';
  mfaCurrentCode = '';
  mfaSetupCode = '';
  mfaSetupSecret = '';
  mfaQrCode = '';
  mfaRecoveryCodes: string[] = [];
  replacingAdminMfa = false;

  message = '';
  error = '';

  todayAttendance: any = null;
  attendance: any[] = [];
  leaves: any[] = [];
  balance: any = {};

  employees: any[] = [];
  adminAttendance: any[] = [];
  adminLeaves: any[] = [];
  attendanceCorrections: any[] = [];
  adminCorrections: any[] = [];
  auditEvents: any[] = [];
  auditTotal = 0;
  notifications: any[] = [];
  unreadNotifications = 0;
  notificationBubble: any = null;
  notificationBubbleTimer: ReturnType<typeof setTimeout> | null = null;
  notificationPolling: ReturnType<typeof setInterval> | null = null;
  notificationIds = new Set<string>();
  notificationFeedInitialized = false;
  notificationAudio: AudioContext | null = null;
  notificationSoundUnlocked = false;
  notificationPushConfigured = false;
  notificationSettingsOpen = false;

  correctionForm: any = { dateKey: '', requestedCheckIn: '', requestedCheckOut: '', reason: '' };
  reportStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString('en-CA');
  reportEnd = new Date().toLocaleDateString('en-CA');
  reportAttendance: any[] = [];
  reportLeaves: any[] = [];
  reportSummary: any = { attendance: {}, leaves: {} };
  announcementForm: any = { title: '', message: '' };

  summary: any = {
    total: 0,
    present: 0,
    absent: 0,
    late: 0,
    onLeave: 0
  };

  loginForm: any = {
    email: '',
    password: ''
  };

  profileForm: any = {
    phone: '',
    address: ''
  };

  passwordForm: any = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  };

  notificationSettings: any = {
    attendanceReminder: true,
    leaveUpdates: true,
    announcements: true,
    push: true,
    sound: true
  };

  leaveForm: any = {
    type: 'annual',
    startDate: '',
    endDate: '',
    reason: ''
  };

  employeeForm: any = {
    name: '',
    email: '',
    password: '',
    employeeId: '',
    department: '',
    designation: '',
    phone: '',
    annual: 24,
    sick: 8,
    casual: 10
  };

  // EDIT EMPLOYEE PROFILE
  showEditEmployeeModal = false;
  selectedEmployee: any = null;
  savingEmployee = false;

  editEmployeeForm: any = {
    name: '',
    email: '',
    employeeId: '',
    phone: '',
    department: '',
    designation: '',
    joiningDate: '',
    address: '',
    annual: 24,
    sick: 8,
    casual: 10
  };

  selectedPhoto: File | null = null;
  selectedPreview = '';
  attendancePhotoUrl = '';

  latitude: number | null = null;
  longitude: number | null = null;
  accuracy: number | null = null;

  currentDate = new Date();

  constructor(private http: HttpClient) {
    const requestedPage = new URLSearchParams(window.location.search).get('page') || '';
    const allowedPages = ['dashboard', 'attendance', 'leaves', 'history', 'employees', 'admin-attendance', 'admin-leaves', 'corrections', 'reports', 'audit', 'settings', 'notifications'];
    const adminOnlyPages = ['employees', 'admin-attendance', 'admin-leaves', 'reports', 'audit'];
    if (this.user && allowedPages.includes(requestedPage)
      && (this.user.role === 'admin' || !adminOnlyPages.includes(requestedPage))) {
      this.page = requestedPage;
    }

    if (this.token && this.user) {
      this.loadNotificationPreferences();
      this.loadData();
      this.startNotificationPolling();
    }
  }

  ngOnDestroy() {
    if (this.notificationPolling) clearInterval(this.notificationPolling);
    if (this.notificationBubbleTimer) clearTimeout(this.notificationBubbleTimer);
    this.closeAttendancePhoto();
    this.notificationAudio?.close();
  }

  @HostListener('document:pointerdown')
  unlockNotificationSound() {
    if (!this.notificationSettings.sound || this.notificationSoundUnlocked) return;
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;

    this.notificationAudio ||= new AudioContextConstructor();
    this.notificationAudio.resume().then(() => {
      this.notificationSoundUnlocked = true;
    }).catch(() => {
      this.notificationSoundUnlocked = false;
    });
  }

  @HostListener('document:visibilitychange')
  onNotificationVisibilityChange() {
    if (document.visibilityState === 'visible' && this.token) this.loadNotificationFeed();
  }

  // ADMIN CHECK
  get isAdmin() {
    return this.user?.role === 'admin';
  }

  // AUTHORIZATION HEADERS
  get headers() {
    return {
      headers: new HttpHeaders({
        Authorization: `Bearer ${this.token}`
      })
    };
  }

  // NOTIFICATION MESSAGE
  notify(text: string, isError = false) {
    this.message = isError ? '' : text;
    this.error = isError ? text : '';

    setTimeout(() => {
      this.message = '';
      this.error = '';
    }, 4500);
  }

  private loadNotificationPreferences() {
    const preferences = this.user?.notificationPreferences || {};
    this.notificationSettings = {
      attendanceReminder: preferences.attendanceReminder ?? true,
      leaveUpdates: preferences.leaveUpdates ?? true,
      announcements: preferences.announcements ?? true,
      push: preferences.push ?? true,
      sound: preferences.sound ?? true
    };
  }

  private showNotificationBubble(item: any) {
    this.notificationBubble = item;
    if (this.notificationBubbleTimer) clearTimeout(this.notificationBubbleTimer);
    this.notificationBubbleTimer = setTimeout(() => {
      this.notificationBubble = null;
      this.notificationBubbleTimer = null;
    }, 9000);
  }

  dismissNotificationBubble() {
    this.notificationBubble = null;
    if (this.notificationBubbleTimer) clearTimeout(this.notificationBubbleTimer);
    this.notificationBubbleTimer = null;
  }

  private startNotificationPolling() {
    if (this.notificationPolling) clearInterval(this.notificationPolling);
    if (!this.token || this.user?.mustChangePassword) return;
    this.notificationFeedInitialized = false;
    this.loadNotificationFeed();
    this.notificationPolling = setInterval(() => {
      if (document.visibilityState === 'visible') this.loadNotificationFeed();
    }, 25000);
  }

  loadNotificationFeed() {
    if (!this.token) return;
    this.http.get<any>(`${this.api}/notifications`, this.headers).subscribe({
      next: response => {
        const rows = response.notifications || [];
        const currentIds = new Set<string>(rows.map((row: any) => String(row._id)));
        const newNotifications = this.notificationFeedInitialized
          ? rows.filter((row: any) => !this.notificationIds.has(String(row._id)))
          : [];
        this.notifications = rows;
        this.unreadNotifications = response.unreadCount || 0;
        this.notificationIds = currentIds;
        if (newNotifications.length) {
          this.showNotificationBubble(newNotifications[0]);
          if (this.notificationSettings.sound) this.playNotificationSound();
        }
        this.notificationFeedInitialized = true;
      },
      error: error => console.error('Notification feed:', error)
    });
  }

  openNotification(item: any) {
    if (!item.readAt) {
      this.http.patch(`${this.api}/notifications/${item._id}/read`, {}, this.headers).subscribe();
      item.readAt = new Date();
      this.unreadNotifications = Math.max(this.unreadNotifications - 1, 0);
    }
    const targetPage = String(item.link || '').replace(/^\//, '');
    if (targetPage) this.changePage(targetPage);
  }

  markAllNotificationsRead() {
    this.http.patch(`${this.api}/notifications/read-all`, {}, this.headers).subscribe({
      next: () => {
        this.notifications = this.notifications.map(item => ({ ...item, readAt: item.readAt || new Date() }));
        this.unreadNotifications = 0;
      },
      error: error => this.notify(error.error?.message || 'Could not update notifications.', true)
    });
  }

  private decodeVapidKey(value: string): Uint8Array {
    const padded = value + '='.repeat((4 - value.length % 4) % 4);
    const raw = window.atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(Array.from(raw, character => character.charCodeAt(0)));
  }

  async enableDeviceNotifications() {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        this.notify('This browser does not support device notifications.', true);
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        this.notify('Allow notifications in your browser settings to receive device alerts.', true);
        return;
      }

      const publicKey = environment.vapidPublicKey;
      if (!publicKey) {
        this.notify('Device push notifications are not configured on the server yet.', true);
        return;
      }

      const registration = await navigator.serviceWorker.register('/notifications-sw.js');
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: this.decodeVapidKey(publicKey) as BufferSource
        });
      }
      const response = await firstValueFrom(this.http.post<any>(`${this.api}/notifications/push/subscription`, subscription.toJSON(), this.headers));
      this.notificationPushConfigured = true;
      this.notificationSettings.push = true;
      this.user.notificationPreferences = response.notificationPreferences;
      localStorage.setItem('attendify_user', JSON.stringify(this.user));
      this.notify('This device can now receive Attendify notifications.');
    } catch (error: any) {
      this.notify(error.error?.message || error.message || 'Could not enable device notifications.', true);
    }
  }

  async disableDeviceNotifications() {
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      let response: any = { pushEnabled: false };
      if (subscription) {
        response = await firstValueFrom(this.http.request<any>('delete', `${this.api}/notifications/push/subscription`, {
          ...this.headers,
          body: { endpoint: subscription.endpoint }
        }));
        await subscription.unsubscribe();
      }
      this.notificationPushConfigured = false;
      this.notificationSettings.push = response.pushEnabled;
      this.notify('Device notifications disabled.');
    } catch (error: any) {
      this.notify(error.error?.message || 'Could not disable device notifications.', true);
    }
  }

  async enableNotificationSound() {
    try {
      const AudioContextConstructor = window.AudioContext;
      if (AudioContextConstructor) {
        this.notificationAudio ||= new AudioContextConstructor();
        await this.notificationAudio.resume();
        this.notificationSoundUnlocked = true;
        this.notificationSettings.sound = true;
        this.playNotificationSound();
        this.http.patch<any>(`${this.api}/auth/notifications`, { sound: true }, this.headers).subscribe({
          next: response => {
            this.user.notificationPreferences = response.notificationPreferences;
            localStorage.setItem('attendify_user', JSON.stringify(this.user));
          },
          error: error => this.notify(error.error?.message || 'Could not save the sound preference.', true)
        });
      }
    } catch {
      this.notify('Sound alerts are not supported by this browser.', true);
    }
  }

  private playNotificationSound() {
    if (!this.notificationSoundUnlocked || !this.notificationAudio) return;
    const oscillator = this.notificationAudio.createOscillator();
    const gain = this.notificationAudio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, this.notificationAudio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, this.notificationAudio.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.notificationAudio.currentTime + 0.35);
    oscillator.connect(gain);
    gain.connect(this.notificationAudio.destination);
    oscillator.start();
    oscillator.stop(this.notificationAudio.currentTime + 0.36);
  }

  // LOGIN
  login() {
    this.busy = true;

    this.http.post<any>(
      `${this.api}/auth/login`,
      this.loginForm
    ).subscribe({
      next: r => {
        if (r.mfaRequired) {
          this.mfaRequired = true;
          this.mfaChallengeToken = r.challengeToken;
          this.busy = false;
          return;
        }
        this.finishLogin(r);
      },
      error: e => {
        this.busy = false;
        this.notify(
          e.error?.message || 'Unable to sign in.',
          true
        );
      }
    });
  }

  verifyAdminMfaLogin() {
    this.busy = true;
    this.http.post<any>(`${this.api}/auth/login/verify-mfa`, {
      challengeToken: this.mfaChallengeToken,
      code: this.mfaCode
    }).subscribe({
      next: response => {
        this.mfaRequired = false;
        this.mfaChallengeToken = '';
        this.mfaCode = '';
        this.finishLogin(response);
      },
      error: error => {
        this.busy = false;
        this.notify(error.error?.message || 'Two-factor verification failed.', true);
      }
    });
  }

  private finishLogin(response: any) {
    this.token = response.token;
    this.user = response.user;
    localStorage.setItem('attendify_token', this.token);
    localStorage.setItem('attendify_user', JSON.stringify(this.user));
    this.profileForm = { phone: this.user.phone || '', address: this.user.address || '' };
    this.notificationSettings = {
      attendanceReminder: this.user.notificationPreferences?.attendanceReminder ?? true,
      leaveUpdates: this.user.notificationPreferences?.leaveUpdates ?? true,
      announcements: this.user.notificationPreferences?.announcements ?? true,
      push: this.user.notificationPreferences?.push ?? true,
      sound: this.user.notificationPreferences?.sound ?? true
    };
    this.busy = false;
    this.notificationIds.clear();
    this.loadData();
    this.startNotificationPolling();
    this.page = this.user.mustChangePassword ? 'settings' : 'dashboard';
    if (this.user.mustChangePassword) this.notify('Please change your temporary password first.');
  }

  // LOGOUT
  logout() {
    if (this.notificationPolling) clearInterval(this.notificationPolling);
    this.notificationPolling = null;
    localStorage.removeItem('attendify_token');
    localStorage.removeItem('attendify_user');

    this.token = '';
    this.user = null;
    this.page = 'dashboard';
    this.notifications = [];
    this.unreadNotifications = 0;
    this.notificationIds.clear();

    this.todayAttendance = null;
    this.attendance = [];
    this.leaves = [];
    this.employees = [];
  }

  // LOAD DATA
  loadData() {
    if (!this.token || !this.user || this.user.mustChangePassword) return;

    if (this.isAdmin) {
      this.loadAdmin();
    } else {
      this.loadEmployee();
    }
  }

  // EMPLOYEE DATA
  loadEmployee() {
    this.http.get<any>(
      `${this.api}/attendance/today`,
      this.headers
    ).subscribe({
      next: r => {
        this.todayAttendance = r || null;
      },
      error: e => console.error('Today attendance:', e)
    });

    this.http.get<any[]>(
      `${this.api}/attendance/mine`,
      this.headers
    ).subscribe({
      next: r => {
        this.attendance = r || [];
      },
      error: e => console.error('Attendance:', e)
    });

    this.http.get<any[]>(
      `${this.api}/leaves/mine`,
      this.headers
    ).subscribe({
      next: r => {
        this.leaves = r || [];
      },
      error: e => console.error('Leaves:', e)
    });

    this.http.get<any>(
      `${this.api}/leaves/balance`,
      this.headers
    ).subscribe({
      next: r => {
        this.balance = r || {};
      },
      error: e => console.error('Leave balance:', e)
    });

    this.http.get<any[]>(`${this.api}/attendance-corrections/mine`, this.headers).subscribe({
      next: rows => this.attendanceCorrections = rows || [],
      error: error => console.error('Attendance corrections:', error)
    });
  }

  // ADMIN DATA
  loadAdmin() {
    this.http.get<any>(
      `${this.api}/attendance/admin/summary`,
      this.headers
    ).subscribe({
      next: r => {
        this.summary = r;
      },
      error: e => console.error('Admin summary:', e)
    });

    this.http.get<any[]>(
      `${this.api}/employees`,
      this.headers
    ).subscribe({
      next: r => {
        this.employees = r || [];
      },
      error: e => {
        this.notify(
          e.error?.message || 'Unable to load employees.',
          true
        );
      }
    });

    this.http.get<any[]>(
      `${this.api}/attendance/admin/all`,
      this.headers
    ).subscribe({
      next: r => {
        this.adminAttendance = r || [];
      },
      error: e => console.error('Admin attendance:', e)
    });

    this.http.get<any[]>(
      `${this.api}/leaves/admin/all`,
      this.headers
    ).subscribe({
      next: r => {
        this.adminLeaves = r || [];
      },
      error: e => console.error('Admin leaves:', e)
    });

    this.http.get<any[]>(`${this.api}/attendance-corrections/admin/all`, this.headers).subscribe({
      next: rows => this.adminCorrections = rows || [],
      error: error => console.error('Admin corrections:', error)
    });
  }

  // PAGE NAVIGATION
  changePage(page: string) {
    this.menuOpen = false;

    if (
      !this.isAdmin &&
      this.user?.mustChangePassword &&
      page !== 'settings'
    ) {
      this.page = 'settings';
      this.notify(
        'Change your temporary password before continuing.',
        true
      );
      return;
    }

    this.page = page;

    if (page === 'notifications') this.loadNotificationFeed();
    if (page === 'audit') this.loadAuditEvents();
    if (page === 'reports') this.loadReports();

    if (page === 'settings' && !this.isAdmin) {
      this.profileForm = {
        phone: this.user.phone || '',
        address: this.user.address || ''
      };

      this.notificationSettings = {
        attendanceReminder:
          this.user.notificationPreferences?.attendanceReminder ?? true,
        leaveUpdates:
          this.user.notificationPreferences?.leaveUpdates ?? true,
        announcements: this.user.notificationPreferences?.announcements ?? true,
        push: this.user.notificationPreferences?.push ?? true,
        sound: this.user.notificationPreferences?.sound ?? true
      };
    }

    if (this.isAdmin) {
      this.loadAdmin();
    } else {
      this.loadEmployee();
    }
  }

  submitAttendanceCorrection() {
    this.http.post<any>(`${this.api}/attendance-corrections`, this.correctionForm, this.headers).subscribe({
      next: () => {
        this.correctionForm = { dateKey: '', requestedCheckIn: '', requestedCheckOut: '', reason: '' };
        this.notify('Attendance correction sent to HR for review.');
        this.loadEmployee();
      },
      error: error => this.notify(error.error?.message || 'Could not submit the correction request.', true)
    });
  }

  reviewAttendanceCorrection(id: string, status: 'approved' | 'rejected') {
    const adminRemark = window.prompt(`Optional HR note for ${status}:`) || '';
    this.http.patch(`${this.api}/attendance-corrections/admin/${id}/review`, { status, adminRemark }, this.headers).subscribe({
      next: () => {
        this.notify(`Attendance correction ${status}.`);
        this.loadAdmin();
      },
      error: error => this.notify(error.error?.message || 'Could not review the correction.', true)
    });
  }

  loadAuditEvents() {
    this.http.get<any>(`${this.api}/audit`, this.headers).subscribe({
      next: response => {
        this.auditEvents = response.events || [];
        this.auditTotal = response.total || 0;
      },
      error: error => this.notify(error.error?.message || 'Could not load the audit log.', true)
    });
  }

  async loadReports() {
    try {
      const params = new HttpParams().set('from', this.reportStart).set('to', this.reportEnd);
      const [attendance, leaves] = await Promise.all([
        firstValueFrom(this.http.get<any>(`${this.api}/reports/attendance`, { ...this.headers, params })),
        firstValueFrom(this.http.get<any>(`${this.api}/reports/leaves`, { ...this.headers, params }))
      ]);
      this.reportAttendance = attendance.records || [];
      this.reportLeaves = leaves.records || [];
      this.reportSummary = { attendance: attendance.summary || {}, leaves: leaves.summary || {} };
    } catch (error: any) {
      this.notify(error.error?.message || 'Could not load reports. Choose a valid date range.', true);
    }
  }

  sendAnnouncement() {
    this.http.post<any>(`${this.api}/notifications/announcements`, this.announcementForm, this.headers).subscribe({
      next: response => {
        this.notify(response.message || 'Announcement sent.');
        this.announcementForm = { title: '', message: '' };
      },
      error: error => this.notify(error.error?.message || 'Announcement could not be sent.', true)
    });
  }

  async setupAdminMfa() {
    try {
      const response = await firstValueFrom(this.http.post<any>(`${this.api}/auth/admin/mfa/setup`, {
        password: this.mfaSetupPassword,
        code: this.mfaCurrentCode
      }, this.headers));
      this.mfaSetupSecret = response.secret;
      this.mfaQrCode = await QRCode.toDataURL(response.otpauthUrl, { width: 220, margin: 2 });
      this.notify('Scan the QR code with an authenticator app, then enter its current code.');
    } catch (error: any) {
      this.notify(error.error?.message || 'Could not start authenticator setup.', true);
    }
  }

  enableAdminMfa() {
    this.http.post<any>(`${this.api}/auth/admin/mfa/enable`, { code: this.mfaSetupCode }, this.headers).subscribe({
      next: response => {
        this.user = response.user;
        localStorage.setItem('attendify_user', JSON.stringify(this.user));
        this.mfaSetupSecret = '';
        this.mfaQrCode = '';
        this.mfaSetupCode = '';
        this.mfaSetupPassword = '';
        this.mfaCurrentCode = '';
        this.mfaRecoveryCodes = response.recoveryCodes || [];
        this.replacingAdminMfa = false;
        this.notify('Two-factor authentication enabled for admin sign-in.');
      },
      error: error => this.notify(error.error?.message || 'Could not enable two-factor authentication.', true)
    });
  }

  disableAdminMfa() {
    this.http.post<any>(`${this.api}/auth/admin/mfa/disable`, {
      password: this.mfaSetupPassword,
      code: this.mfaSetupCode
    }, this.headers).subscribe({
      next: response => {
        this.token = response.token;
        localStorage.setItem('attendify_token', this.token);
        this.user.adminMfaEnabled = false;
        localStorage.setItem('attendify_user', JSON.stringify(this.user));
        this.mfaSetupPassword = '';
        this.mfaCurrentCode = '';
        this.mfaSetupCode = '';
        this.notify(response.message || 'Two-factor authentication disabled.');
      },
      error: error => this.notify(error.error?.message || 'Could not disable two-factor authentication.', true)
    });
  }

  // SELECT ATTENDANCE PHOTO
  onPhoto(event: any) {
    const file = event.target.files?.[0];

    if (!file) return;

    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    ) {
      this.notify(
        'Please select JPG, PNG or WEBP image.',
        true
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.notify(
        'Photo must be smaller than 5 MB.',
        true
      );
      return;
    }

    if (this.selectedPreview) {
      URL.revokeObjectURL(this.selectedPreview);
    }

    this.selectedPhoto = file;
    this.selectedPreview = URL.createObjectURL(file);
  }

  // GET CURRENT LOCATION
  getLocation(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject('Your browser does not support location.');
        return;
      }

      navigator.geolocation.getCurrentPosition(
        pos => {
          this.latitude = pos.coords.latitude;
          this.longitude = pos.coords.longitude;
          this.accuracy = pos.coords.accuracy;

          this.error = '';
          this.message = '';

          resolve();
        },
        error => {
          console.error('Location Error:', error);

          if (error.code === 1) {
            reject(
              'Location permission denied. Allow location access.'
            );
          } else if (error.code === 2) {
            reject(
              'Location unavailable. Check Windows location settings.'
            );
          } else if (error.code === 3) {
            reject(
              'Location request timed out. Please try again.'
            );
          } else {
            reject('Unable to get your location.');
          }
        },
        {
          enableHighAccuracy: false,
          timeout: 30000,
          maximumAge: 10000
        }
      );
    });
  }

  // MARK CHECK-IN / CHECK-OUT
  async markAttendance(action: 'check-in' | 'check-out') {
    try {
      if (!this.selectedPhoto) {
        this.notify(
          'Please take or upload your attendance photo first.',
          true
        );
        return;
      }

      this.busy = true;

      await this.getLocation();

      const data = new FormData();

      data.append('photo', this.selectedPhoto);
      data.append('latitude', String(this.latitude));
      data.append('longitude', String(this.longitude));
      data.append('accuracy', String(this.accuracy));

      this.http.post<any>(
        `${this.api}/attendance/${action}`,
        data,
        this.headers
      ).subscribe({
        next: r => {
          this.busy = false;

          this.selectedPhoto = null;

          if (this.selectedPreview) {
            URL.revokeObjectURL(this.selectedPreview);
          }

          this.selectedPreview = '';

          this.notify(
            action === 'check-in'
              ? 'Check-in marked successfully.'
              : 'Check-out marked successfully.'
          );

          this.loadEmployee();
        },
        error: e => {
          this.busy = false;

          this.notify(
            e.error?.message || 'Attendance could not be saved.',
            true
          );
        }
      });

    } catch (e: any) {
      this.busy = false;
      this.notify(
        typeof e === 'string' ? e : 'Unable to mark attendance.',
        true
      );
    }
  }

  // SUBMIT LEAVE REQUEST
  submitLeave() {
    if (
      !this.leaveForm.startDate ||
      !this.leaveForm.endDate ||
      !this.leaveForm.reason.trim()
    ) {
      this.notify(
        'Please complete all leave fields.',
        true
      );
      return;
    }

    this.http.post(
      `${this.api}/leaves`,
      this.leaveForm,
      this.headers
    ).subscribe({
      next: () => {
        this.notify('Leave request submitted.');

        this.leaveForm = {
          type: 'annual',
          startDate: '',
          endDate: '',
          reason: ''
        };

        this.loadEmployee();
      },
      error: e => {
        this.notify(
          e.error?.message || 'Leave request failed.',
          true
        );
      }
    });
  }

  // ADD EMPLOYEE
  addEmployee() {
    if (
      !this.employeeForm.name.trim() ||
      !this.employeeForm.email.trim()
    ) {
      this.notify(
        'Employee name and email are required.',
        true
      );
      return;
    }

    const payload = {
      ...this.employeeForm,
      leaveAllowance: {
        annual: Number(this.employeeForm.annual),
        sick: Number(this.employeeForm.sick),
        casual: Number(this.employeeForm.casual)
      }
    };

    this.busy = true;

    this.http.post<any>(
      `${this.api}/employees`,
      payload,
      this.headers
    ).subscribe({
      next: () => {
        this.busy = false;

        this.notify('Employee created successfully.');

        this.employeeForm = {
          name: '',
          email: '',
          password: 'Welcome@123',
          employeeId: '',
          department: '',
          designation: '',
          phone: '',
          annual: 24,
          sick: 8,
          casual: 10
        };

        this.loadAdmin();
      },
      error: e => {
        this.busy = false;

        this.notify(
          e.error?.message || 'Could not create employee.',
          true
        );
      }
    });
  }

  // ==========================================
  // ADMIN: EDIT EMPLOYEE PROFILE
  // ==========================================

  editEmployee(e: any) {
    this.selectedEmployee = e;

    this.editEmployeeForm = {
      name: e.name || '',
      email: e.email || '',
      employeeId: e.employeeId || '',
      phone: e.phone || '',
      department: e.department || '',
      designation: e.designation || '',

      // Avoid timezone shifting the selected date.
      joiningDate: e.joiningDate
        ? String(e.joiningDate).slice(0, 10)
        : '',

      address: e.address || '',

      annual: e.leaveAllowance?.annual ?? 24,
      sick: e.leaveAllowance?.sick ?? 8,
      casual: e.leaveAllowance?.casual ?? 10
    };

    this.showEditEmployeeModal = true;
  }

  // SAVE EMPLOYEE PROFILE
  saveEmployeeProfile() {
    if (!this.selectedEmployee) return;

    if (
      !this.editEmployeeForm.name.trim() ||
      !this.editEmployeeForm.email.trim()
    ) {
      this.notify(
        'Name and email are required.',
        true
      );
      return;
    }

    const annual = Number(this.editEmployeeForm.annual);
    const sick = Number(this.editEmployeeForm.sick);
    const casual = Number(this.editEmployeeForm.casual);

    if (
      !Number.isFinite(annual) ||
      !Number.isFinite(sick) ||
      !Number.isFinite(casual) ||
      annual < 0 ||
      sick < 0 ||
      casual < 0
    ) {
      this.notify(
        'Leave allowance must be valid non-negative numbers.',
        true
      );
      return;
    }

    const payload = {
      name: this.editEmployeeForm.name.trim(),
      email: this.editEmployeeForm.email.trim().toLowerCase(),
      employeeId: this.editEmployeeForm.employeeId.trim(),
      phone: this.editEmployeeForm.phone.trim(),
      department: this.editEmployeeForm.department.trim(),
      designation: this.editEmployeeForm.designation.trim(),
      joiningDate: this.editEmployeeForm.joiningDate || null,
      address: this.editEmployeeForm.address.trim(),

      leaveAllowance: {
        annual,
        sick,
        casual
      }
    };

    this.savingEmployee = true;

    this.http.patch<any>(
      `${this.api}/employees/${this.selectedEmployee._id}`,
      payload,
      this.headers
    ).subscribe({
      next: response => {
        this.savingEmployee = false;

        this.showEditEmployeeModal = false;
        this.selectedEmployee = null;

        this.notify(
          response?.message ||
          'Employee profile updated successfully.'
        );

        this.loadAdmin();
      },
      error: e => {
        this.savingEmployee = false;

        this.notify(
          e.error?.message ||
          'Unable to update employee profile.',
          true
        );
      }
    });
  }

  // CLOSE EDIT MODAL
  closeEditEmployeeModal() {
    if (this.savingEmployee) return;

    this.showEditEmployeeModal = false;
    this.selectedEmployee = null;
  }

  // ACTIVATE / DEACTIVATE EMPLOYEE
  toggleEmployeeStatus(employee: any) {
    const newStatus = !employee.active;

    const action = newStatus
      ? 'activate'
      : 'deactivate';

    if (
      !confirm(
        `Are you sure you want to ${action} this employee?`
      )
    ) {
      return;
    }

    this.http.patch(
      `${this.api}/employees/${employee._id}`,
      { active: newStatus },
      this.headers
    ).subscribe({
      next: () => {
        this.notify(
          newStatus
            ? 'Employee activated successfully.'
            : 'Employee deactivated successfully.'
        );

        this.loadAdmin();
      },
      error: e => {
        this.notify(
          e.error?.message ||
          'Unable to update employee status.',
          true
        );
      }
    });
  }

  // OLD DEACTIVATE METHOD
  deactivateEmployee(id: string) {
    if (!confirm('Deactivate this employee account?')) {
      return;
    }

    this.http.delete(
      `${this.api}/employees/${id}`,
      this.headers
    ).subscribe({
      next: () => {
        this.notify('Employee deactivated.');
        this.loadAdmin();
      },
      error: e => {
        this.notify(
          e.error?.message || 'Action failed.',
          true
        );
      }
    });
  }

  // REVIEW LEAVE REQUEST
  reviewLeave(id: string, status: string) {
    const remark =
      window.prompt(`Optional remark for ${status}:`) || '';

    this.http.patch(
      `${this.api}/leaves/admin/${id}/review`,
      {
        status,
        adminRemark: remark
      },
      this.headers
    ).subscribe({
      next: () => {
        this.notify(`Leave ${status}.`);
        this.loadAdmin();
      },
      error: e => {
        this.notify(
          e.error?.message || 'Unable to update leave.',
          true
        );
      }
    });
  }

  // GOOGLE MAP URL
  mapUrl(lat: number, lng: number) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }

  // VIEW ATTENDANCE PHOTO
  viewPhoto(filename: string) {
    if (this.attendancePhotoUrl) {
      URL.revokeObjectURL(this.attendancePhotoUrl);
      this.attendancePhotoUrl = '';
    }

    this.http.get(
      `${this.api}/attendance/photo/${encodeURIComponent(filename)}`,
      {
        headers: new HttpHeaders({
          Authorization: `Bearer ${this.token}`
        }),
        responseType: 'blob'
      }
    ).subscribe({
      next: blob => {
        this.attendancePhotoUrl = URL.createObjectURL(blob);
      },
      error: () => {
        this.notify(
          'Photo could not be opened.',
          true
        );
      }
    });
  }

  closeAttendancePhoto() {
    if (this.attendancePhotoUrl) {
      URL.revokeObjectURL(this.attendancePhotoUrl);
      this.attendancePhotoUrl = '';
    }
  }

  // EXPORT CSV
  exportCsv(
    filename: string,
    rows: any[],
    columns: string[]
  ) {
    if (!rows.length) {
      this.notify(
        'There is no data to export.',
        true
      );
      return;
    }

    const escape = (value: any) =>
      `"${String(value ?? '').replace(/"/g, '""')}"`;

    const csv = [
      columns.join(','),

      ...rows.map(row =>
        columns.map(key =>
          escape(
            key.split('.').reduce(
              (v: any, k: string) => v?.[k],
              row
            )
          )
        ).join(',')
      )
    ].join('\n');

    const blob = new Blob(
      [csv],
      { type: 'text/csv;charset=utf-8;' }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = filename;

    a.click();

    URL.revokeObjectURL(url);
  }

  // CALCULATE WORKING HOURS
  hours(row: any) {
    if (!row.checkOut) {
      return 'In progress';
    }

    const ms =
      new Date(row.checkOut).getTime() -
      new Date(row.checkIn).getTime();

    return `${Math.floor(ms / 3600000)}h ${
      Math.floor((ms % 3600000) / 60000)
    }m`;
  }

  // ADMIN PENDING LEAVES
  get pendingLeaves() {
    return this.adminLeaves.filter(
      l => l.status === 'pending'
    ).length;
  }

  get pendingCorrections() {
    return this.adminCorrections.filter(request => request.status === 'pending').length;
  }

  // EMPLOYEE PENDING LEAVES
  get pendingEmployeeLeaves() {
    return this.leaves.filter(
      l => l.status === 'pending'
    ).length;
  }

  // ATTENDANCE THIS MONTH
  get attendanceThisMonth() {
    const month = new Date()
      .toLocaleDateString('en-CA')
      .slice(0, 7);

    return this.attendance.filter(row =>
      String(row.dateKey || '').startsWith(month)
    ).length;
  }

  // UPDATE EMPLOYEE PROFILE
  saveProfile() {
    this.http.patch<any>(
      `${this.api}/auth/profile`,
      this.profileForm,
      this.headers
    ).subscribe({
      next: r => {
        this.user.phone = r.user.phone;
        this.user.address = r.user.address;

        localStorage.setItem(
          'attendify_user',
          JSON.stringify(this.user)
        );

        this.notify('Profile updated successfully.');
      },
      error: e => {
        this.notify(
          e.error?.message || 'Profile update failed.',
          true
        );
      }
    });
  }

  // CHANGE PASSWORD
  changePassword() {
    if (
      this.passwordForm.newPassword !==
      this.passwordForm.confirmPassword
    ) {
      this.notify(
        'New passwords do not match.',
        true
      );
      return;
    }

    if (
      !this.passwordForm.currentPassword ||
      !this.passwordForm.newPassword
    ) {
      this.notify(
        'Please complete all password fields.',
        true
      );
      return;
    }

    this.busy = true;

    this.http.post<any>(
      `${this.api}/auth/change-password`,
      this.passwordForm,
      this.headers
    ).subscribe({
      next: r => {
        this.token = r.token;

        this.user.mustChangePassword = false;

        localStorage.setItem(
          'attendify_token',
          this.token
        );

        localStorage.setItem(
          'attendify_user',
          JSON.stringify(this.user)
        );

        this.passwordForm = {
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        };

        this.busy = false;
        this.page = this.isAdmin ? 'settings' : 'dashboard';

        this.notify('Password changed successfully.');

        this.loadData();
        this.startNotificationPolling();
      },
      error: e => {
        this.busy = false;

        this.notify(
          e.error?.message || 'Password change failed.',
          true
        );
      }
    });
  }

  // SAVE NOTIFICATION SETTINGS
  saveNotifications() {
    this.http.patch<any>(
      `${this.api}/auth/notifications`,
      this.notificationSettings,
      this.headers
    ).subscribe({
      next: r => {
        this.user.notificationPreferences = r.notificationPreferences || r.user?.notificationPreferences;

        localStorage.setItem(
          'attendify_user',
          JSON.stringify(this.user)
        );

        this.notify('Notification settings saved.');
        if (!this.notificationSettings.sound && this.notificationAudio) {
          this.notificationAudio.close();
          this.notificationAudio = null;
          this.notificationSoundUnlocked = false;
        }
      },
      error: e => {
        this.notify(
          e.error?.message || 'Settings could not be saved.',
          true
        );
      }
    });
  }
}
