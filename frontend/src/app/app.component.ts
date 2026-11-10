
import { Component } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html'
})
export class AppComponent {
  api = 'http://localhost:5000/api';

  token = localStorage.getItem('attendify_token') || '';
  user: any = JSON.parse(localStorage.getItem('attendify_user') || 'null');

  page = 'dashboard';
  busy = false;

  message = '';
  error = '';

  todayAttendance: any = null;
  attendance: any[] = [];
  leaves: any[] = [];
  balance: any = {};

  employees: any[] = [];
  adminAttendance: any[] = [];
  adminLeaves: any[] = [];

  summary: any = {
    total: 0,
    present: 0,
    absent: 0,
    late: 0,
    onLeave: 0
  };

  loginForm: any = {
    email: 'employee@attendify.local',
    password: 'Employee@12345'
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
    announcements: true
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
    password: 'Welcome@123',
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

  latitude: number | null = null;
  longitude: number | null = null;
  accuracy: number | null = null;

  currentDate = new Date();

  constructor(private http: HttpClient) {
    if (this.token && this.user) {
      this.loadData();
    }
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

  // LOGIN
  login() {
    this.busy = true;

    this.http.post<any>(
      `${this.api}/auth/login`,
      this.loginForm
    ).subscribe({
      next: r => {
        this.token = r.token;
        this.user = r.user;

        localStorage.setItem('attendify_token', this.token);
        localStorage.setItem(
          'attendify_user',
          JSON.stringify(this.user)
        );

        this.profileForm = {
          phone: this.user.phone || '',
          address: this.user.address || ''
        };

        this.notificationSettings = {
          attendanceReminder:
            this.user.notificationPreferences?.attendanceReminder ?? true,
          leaveUpdates:
            this.user.notificationPreferences?.leaveUpdates ?? true,
          announcements:
            this.user.notificationPreferences?.announcements ?? true
        };

        this.busy = false;

        if (this.user.mustChangePassword) {
          this.page = 'settings';
          this.notify('Please change your temporary password first.');
        } else {
          this.page = 'dashboard';
          this.loadData();
        }
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

  // LOGOUT
  logout() {
    localStorage.removeItem('attendify_token');
    localStorage.removeItem('attendify_user');

    this.token = '';
    this.user = null;
    this.page = 'dashboard';

    this.todayAttendance = null;
    this.attendance = [];
    this.leaves = [];
    this.employees = [];
  }

  // LOAD DATA
  loadData() {
    if (!this.token || !this.user) return;

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
  }

  // PAGE NAVIGATION
  changePage(page: string) {
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
        announcements:
          this.user.notificationPreferences?.announcements ?? true
      };
    }

    if (this.isAdmin) {
      this.loadAdmin();
    } else {
      this.loadEmployee();
    }
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

          console.log('Latitude:', this.latitude);
          console.log('Longitude:', this.longitude);
          console.log('Accuracy:', this.accuracy);

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
        const url = URL.createObjectURL(blob);

        window.open(url, '_blank');

        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 60000);
      },
      error: () => {
        this.notify(
          'Photo could not be opened.',
          true
        );
      }
    });
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
        this.page = 'dashboard';

        this.notify('Password changed successfully.');

        this.loadEmployee();
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
        this.user.notificationPreferences =
          r.notificationPreferences ||
          r.user?.notificationPreferences;

        localStorage.setItem(
          'attendify_user',
          JSON.stringify(this.user)
        );

        this.notify('Notification settings saved.');
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
