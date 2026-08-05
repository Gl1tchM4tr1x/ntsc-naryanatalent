(() => {
    const STORAGE_KEY = 'ntsc_portal_data_v1';

    const DEFAULT_DATA = {
        student: {
            name: 'DEVANSHU GURJAR',
            email: 'DEVANSHUGURJAR414@GMAIL.COM',
            mobile: '9530135914',
            goal: 'JEE',
            currentClass: '12 Passed',
            studentId: '26040101320',
            batch: 'N13J-T1Z',
            registration: '1026025772'
        },
        attendance: [{
                month: 'May 2128',
                value: '0/3'
            },
            {
                month: 'July 2026',
                value: '21/21'
            },
            {
                month: 'June 2026',
                value: '21/21'
            },
            {
                month: 'May 2026',
                value: '16/16'
            }
        ],
        dashboardDate: '2026-07-27',
        timetable: [
            ['2026-07-27', '08:30 to 10:00', 'Regular Class', 'Physic Trk-2'],
            ['2026-07-27', '10:15 to 11:45', 'Regular Class', 'Maths Trk-2'],
            ['2026-07-27', '12:00 to 13:30', 'Regular Class', 'Chemistry Trk-2'],
            ['2026-07-27', '13:31 to 14:01', 'Doubt Class', 'Mathematics,Chemistry,Physics'],
            ['2026-07-28', '08:30 to 10:00', 'Regular Class', 'Chemistry Trk-1'],
            ['2026-07-28', '10:15 to 11:45', 'Regular Class', 'Physics Trk-1'],
            ['2026-07-28', '12:00 to 13:30', 'Regular Class', 'Maths Trk-1'],
            ['2026-07-28', '13:31 to 14:01', 'Doubt Class', 'Mathematics,Chemistry,Physics'],
            ['2026-07-29', '08:30 to 10:00', 'Regular Class', 'Physic Trk-2'],
            ['2026-07-29', '10:15 to 11:45', 'Regular Class', 'Chemistry Trk-1'],
            ['2026-07-29', '12:00 to 13:30', 'Regular Class', 'Maths Trk-1'],
            ['2026-07-29', '13:31 to 14:01', 'Doubt Class', 'Mathematics,Chemistry,Physics'],
            ['2026-07-30', '08:30 to 10:00', 'Regular Class', 'Maths Trk-2'],
            ['2026-07-30', '10:15 to 11:45', 'Regular Class', 'Chemistry Trk-2'],
            ['2026-07-30', '12:00 to 13:30', 'Regular Class', 'Physics Trk-1'],
            ['2026-07-30', '13:31 to 14:01', 'Doubt Class', 'Mathematics,Chemistry,Physics']
        ],
        examCalendar: [
            ['Internal Test-05 (T1S & T1Z)', '23-Aug-2026 09:00 AM', 'JEE', 'Narayana Gopalpura (NIHQ): B-28, 10-B Scheme, Ridhi Sidhi Circle, Gopalpura Bypass Jaipur-302018'],
            ['Internal Test-03 (T1A & T1V)', '23-Aug-2026 09:00 AM', 'JEE', 'Ridhi Sidhi & Hanuman Nagar'],
            ['Internal Test-04A (T1S & T1Z)', '02-Aug-2026 09:00 AM', 'JEE', 'Narayana Gopalpura (NIHQ): B-28, 10-B Scheme, Ridhi Sidhi Circle, Gopalpura Bypass Jaipur-302018'],
            ['Internal Test-03 (T1Z)', '12-Jul-2026 09:00 AM', 'JEE', 'Narayana Gopalpura (NIHQ): B-28, 10-B Scheme, Ridhi Sidhi Circle, Gopalpura Bypass Jaipur-302018'],
            ['Internal Test-02 (T1Z)', '21-Jun-2026 09:00 AM', 'JEE', 'Narayana Gopalpura (NIHQ): B-28, 10-B Scheme, Ridhi Sidhi Circle, Gopalpura Bypass Jaipur-302018'],
            ['Internal Test-01 (T1Z)', '31-May-2026 09:00 AM', 'JEE', 'Narayana Gopalpura (NIHQ): B-28, 10-B Scheme, Ridhi Sidhi Circle, Gopalpura Bypass Jaipur-302018']
        ],
        tests: [{
                id: 'it3',
                name: 'JEE INTERNAL TEST-3 (T1Z)',
                date: '12/07/2026<br>09:00 am',
                type: 'Non live',
                duration: '180 min',
                status: 'Closed'
            },
            {
                id: 'it2',
                name: 'JEE INTERNAL TEST-2 (T1Z)',
                date: '21/06/2026<br>09:00 am',
                type: 'Non live',
                duration: '180 min',
                status: 'Closed'
            },
            {
                id: 'it1',
                name: 'JEE INTERNAL TEST-1 (T1Z)',
                date: '31/05/2026<br>09:00 am',
                type: 'Non live',
                duration: '180 min',
                status: 'Closed'
            }
        ],
        results: {
            it3: {
                name: 'JEE INTERNAL TEST-3 (T1Z)',
                attemptDate: '12/07/2026',
                marks: 62,
                maxMarks: 180,
                rank: 13,
                percentile: '61.11',
                avgMarks: '47.39',
                percentage: '34.44%',
                correct: 18,
                incorrect: 10,
                attempted: 28,
                unattempted: 10,
                showLeaderBoard: false,
                rows: [
                    ['Maths', '60', '20', '10.42', '29', '33.33%', '48.50', '24'],
                    ['Physics', '60', '25', '22.01', '51', '41.67%', '58.21', '29'],
                    ['Chemistry', '60', '17', '14.96', '48', '28.33%', '44.00', '30'],
                    ['Total', '180', '62', '47.39', '106', '34.44 %', '61.11', '13']
                ]
            },
            it2: {
                name: 'JEE INTERNAL TEST-2 (T1Z)',
                attemptDate: '21/06/2026',
                marks: 124,
                maxMarks: 300,
                rank: 9,
                percentile: '72.50',
                avgMarks: '137.33',
                percentage: '41.33%',
                correct: 33,
                incorrect: 8,
                attempted: 41,
                unattempted: 34,
                showLeaderBoard: false,
                rows: [
                    ['Physics', '100', '61', '65.25', '88', '61.00%', '51.25', '41'],
                    ['Chemistry', '100', '45', '47.68', '75', '45.00%', '53.05', '38'],
                    ['Maths', '100', '18', '24.83', '70', '18.00%', '35.90', '40'],
                    ['Total', '300', '124', '137.33', '240', '41.33 %', '72.50', '9']
                ]
            },
            it1: {
                name: 'JEE INTERNAL TEST-1 (T1Z)',
                attemptDate: '31/05/2026',
                marks: 95,
                maxMarks: 300,
                rank: 16,
                percentile: '48.28',
                avgMarks: '106.03',
                percentage: '31.67%',
                correct: 27,
                incorrect: 13,
                attempted: 40,
                unattempted: 35,
                showLeaderBoard: true,
                rows: [
                    ['Physics', '100', '36', '39.59', '78', '36.00%', '41.38', '18'],
                    ['Chemistry', '100', '29', '25.52', '66', '29.00%', '62.07', '12'],
                    ['Maths', '100', '30', '40.93', '91', '30.00%', '41.38', '18'],
                    ['Total', '300', '95', '106.03', '219', '31.67 %', '48.28', '16']
                ]
            }
        }
    };

    const clone = (obj) => JSON.parse(JSON.stringify(obj));
    const deepMerge = (base, saved) => {
        if (!saved || typeof saved !== 'object') return clone(base);
        const out = Array.isArray(base) ? clone(base) : { ...clone(base)
        };
        Object.keys(saved).forEach((key) => {
            if (saved[key] && typeof saved[key] === 'object' && !Array.isArray(saved[key]) && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
                out[key] = deepMerge(base[key], saved[key]);
            } else {
                out[key] = saved[key];
            }
        });
        return out;
    };

    function getData() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return clone(DEFAULT_DATA);
            return deepMerge(DEFAULT_DATA, JSON.parse(raw));
        } catch (error) {
            console.warn('NTSC local data failed, using defaults', error);
            return clone(DEFAULT_DATA);
        }
    }

    function saveData(data) {
        const clean = deepMerge(DEFAULT_DATA, data || {});
        localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
        return clean;
    }

    function resetData() {
        localStorage.removeItem(STORAGE_KEY);
        return clone(DEFAULT_DATA);
    }

    function downloadJSON(filename = 'ntsc-portal-data.json') {
        const blob = new Blob([JSON.stringify(getData(), null, 2)], {
            type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    async function loadFromBackend() {
        if (location.protocol === 'file:') return null;
        const res = await fetch('/api/portal-data', {
            cache: 'no-store'
        });
        if (!res.ok) throw new Error('Backend API ' + res.status);
        const remoteData = await res.json();
        if (remoteData) {
            const merged = saveData(remoteData);
            window.dispatchEvent(new CustomEvent('ntsc:data-updated', {
                detail: merged
            }));
            return merged;
        }
        return null;
    }

    async function saveToBackend(data) {
        const clean = saveData(data);
        if (location.protocol === 'file:') return clean;
        const res = await fetch('/api/portal-data', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(clean)
        });
        if (!res.ok) throw new Error('Backend API ' + res.status);
        const saved = await res.json();
        const merged = saveData(saved);
        window.dispatchEvent(new CustomEvent('ntsc:data-updated', {
            detail: merged
        }));
        return merged;
    }

    function getCloudConfig() {
        const cfg = window.NTSC_FIREBASE_CONFIG || {};
        return {
            firebaseConfig: {
                apiKey: cfg.apiKey || '',
                authDomain: cfg.authDomain || '',
                databaseURL: cfg.databaseURL || '',
                projectId: cfg.projectId || '',
                storageBucket: cfg.storageBucket || '',
                messagingSenderId: cfg.messagingSenderId || '',
                appId: cfg.appId || ''
            },
            path: cfg.DATA_PATH || 'portal_data/main'
        };
    }

    function cloudReady() {
        const cfg = getCloudConfig();
        return Boolean(window.firebase && cfg.firebaseConfig.apiKey && cfg.firebaseConfig.databaseURL);
    }

    function client() {
        if (!cloudReady()) return null;
        const cfg = getCloudConfig();
        if (!window.firebase.apps.length) {
            window.firebase.initializeApp(cfg.firebaseConfig);
        }
        return window.firebase.database();
    }

    async function loadFromCloud() {
        if (!cloudReady()) return null;
        const cfg = getCloudConfig();
        const db = client();
        const snapshot = await db.ref(cfg.path).once('value');
        const remoteData = snapshot.val();
        if (remoteData) {
            const merged = saveData(remoteData);
            window.dispatchEvent(new CustomEvent('ntsc:data-updated', {
                detail: merged
            }));
            return merged;
        }
        return null;
    }

    async function saveToCloud(data) {
        const clean = saveData(data);
        if (!cloudReady()) return clean;
        const cfg = getCloudConfig();
        const db = client();
        await db.ref(cfg.path).set({ ...clean,
            updated_at: new Date().toISOString()
        });
        window.dispatchEvent(new CustomEvent('ntsc:data-updated', {
            detail: clean
        }));
        return clean;
    }

    async function syncFromCloudIfAvailable() {
        try {
            const apiData = await loadFromBackend();
            if (apiData) return apiData;
        } catch (error) {
            console.warn('Backend API sync failed, trying Firebase/localStorage', error);
        }
        try {
            return await loadFromCloud();
        } catch (error) {
            console.warn('Firebase sync failed, using localStorage', error);
            return null;
        }
    }

    window.NTSCStore = {
        STORAGE_KEY,
        DEFAULT_DATA: clone(DEFAULT_DATA),
        getData,
        saveData,
        resetData,
        downloadJSON,
        loadFromBackend,
        saveToBackend,
        getCloudConfig,
        cloudReady,
        loadFromCloud,
        saveToCloud,
        syncFromCloudIfAvailable
    };
})();