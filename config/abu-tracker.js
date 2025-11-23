// abu-tracker.js
// Zentrales Tracking-Modul für ABU EBA Portfolio
// Version 1.0 - Phase 1

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, updateDoc, arrayUnion, increment, collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

class ABUTracker {
    constructor() {
        this.firebaseConfig = {
            apiKey: "AIzaSyDPWkwiCptXi_Ky-yUgrvxrtpRzH1HGd_0",
            authDomain: "abu-edu-2030.firebaseapp.com",
            projectId: "abu-edu-2030",
            storageBucket: "abu-edu-2030.firebasestorage.app",
            messagingSenderId: "895317724223",
            appId: "1:895317724223:web:de551267b1431bea947c8a"
        };

        this.app = null;
        this.auth = null;
        this.db = null;
        this.currentUserCode = null;
        this.currentUserRole = null;
        this.isInitialized = false;

        this.init();
    }

    // Initialize Firebase
    async init() {
        try {
            this.app = initializeApp(this.firebaseConfig);
            this.auth = getAuth(this.app);
            this.db = getFirestore(this.app);

            if (!this.auth.currentUser) {
                await signInAnonymously(this.auth);
            }

            // Check if user is already logged in
            const savedCode = localStorage.getItem('abuUserCode');
            if (savedCode) {
                this.currentUserCode = savedCode;
                this.currentUserRole = localStorage.getItem('abuUserRole') || 'lernende';
            }

            this.isInitialized = true;
            console.log('✅ ABU Tracker initialized');
        } catch (error) {
            console.error('❌ Firebase initialization error:', error);
            this.isInitialized = false;
        }
    }

    // Hash PIN for security
    async hashPIN(pin) {
        const encoder = new TextEncoder();
        const data = encoder.encode(pin);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Create new user with Code + PIN
    async createUser(code, pin, role = 'lernende') {
        if (!this.isInitialized) {
            throw new Error('Tracker not initialized');
        }

        // Validate code format (e.g., ANNA-2024-KV)
        const codeRegex = /^[A-Z0-9]+-[0-9]{4}-[A-Z0-9]+$/i;
        if (!codeRegex.test(code)) {
            throw new Error('Code-Format ungültig. Nutze: NAME-JAHR-KLASSE (z.B. ANNA-2024-KV)');
        }

        // Validate PIN (4 digits)
        if (!/^\d{4}$/.test(pin)) {
            throw new Error('PIN muss 4 Ziffern sein');
        }

        const upperCode = code.toUpperCase();

        // Check if code already exists
        const userDoc = await getDoc(doc(this.db, 'users', upperCode));
        if (userDoc.exists()) {
            throw new Error('Dieser Code existiert bereits');
        }

        // Hash PIN
        const hashedPIN = await this.hashPIN(pin);

        // Create user document
        await setDoc(doc(this.db, 'users', upperCode), {
            code: upperCode,
            pin: hashedPIN,
            role: role,
            createdAt: new Date(),
            shares: [], // Who can view this portfolio
            hasAccessTo: {} // Which portfolios this user can access
        });

        // Initialize user progress
        await setDoc(doc(this.db, 'userProgress', upperCode), {
            points: 0,
            sectionsCompleted: [],
            achievements: [],
            modules: {},
            lastUpdated: new Date()
        });

        // Sign in anonymously for Firebase Auth
        await signInAnonymously(this.auth);

        // Save to localStorage
        this.currentUserCode = upperCode;
        this.currentUserRole = role;
        localStorage.setItem('abuUserCode', upperCode);
        localStorage.setItem('abuUserRole', role);

        console.log('✅ User created:', upperCode);
        return { code: upperCode, role: role };
    }

    // Login with Code + PIN
    async login(code, pin) {
        if (!this.isInitialized) {
            throw new Error('Tracker not initialized');
        }

        const upperCode = code.toUpperCase();

        // Get user document
        const userDoc = await getDoc(doc(this.db, 'users', upperCode));
        if (!userDoc.exists()) {
            throw new Error('Code nicht gefunden');
        }

        const userData = userDoc.data();

        // Verify PIN
        const hashedPIN = await this.hashPIN(pin);
        if (hashedPIN !== userData.pin) {
            throw new Error('PIN falsch');
        }

        // Sign in anonymously for Firebase Auth
        await signInAnonymously(this.auth);

        // Save to localStorage
        this.currentUserCode = upperCode;
        this.currentUserRole = userData.role;
        localStorage.setItem('abuUserCode', upperCode);
        localStorage.setItem('abuUserRole', userData.role);

        console.log('✅ Login successful:', upperCode);
        return { code: upperCode, role: userData.role };
    }

    // Logout
    logout() {
        this.currentUserCode = null;
        this.currentUserRole = null;
        localStorage.removeItem('abuUserCode');
        localStorage.removeItem('abuUserRole');
        console.log('✅ Logged out');
    }

    // Check if user is logged in
    isLoggedIn() {
        return this.currentUserCode !== null;
    }

    // Get current user info
    getCurrentUser() {
        return {
            code: this.currentUserCode,
            role: this.currentUserRole
        };
    }

    // Track progress for a module
    async trackProgress(moduleId, data) {
        if (!this.isLoggedIn()) {
            throw new Error('Not logged in');
        }

        const progressRef = doc(this.db, 'userProgress', this.currentUserCode);
        
        try {
            await updateDoc(progressRef, {
                [`modules.${moduleId}`]: {
                    ...data,
                    lastUpdated: new Date()
                },
                lastUpdated: new Date()
            });

            console.log('✅ Progress tracked:', moduleId);
        } catch (error) {
            console.error('❌ Error tracking progress:', error);
            throw error;
        }
    }

    // Add points
    async addPoints(points, reason = '') {
        if (!this.isLoggedIn()) {
            throw new Error('Not logged in');
        }

        const progressRef = doc(this.db, 'userProgress', this.currentUserCode);
        
        try {
            await updateDoc(progressRef, {
                points: increment(points),
                lastUpdated: new Date()
            });

            console.log(`✅ Added ${points} points: ${reason}`);
            return points;
        } catch (error) {
            console.error('❌ Error adding points:', error);
            throw error;
        }
    }

    // Add achievement
    async addAchievement(achievement) {
        if (!this.isLoggedIn()) {
            throw new Error('Not logged in');
        }

        const progressRef = doc(this.db, 'userProgress', this.currentUserCode);
        
        try {
            await updateDoc(progressRef, {
                achievements: arrayUnion(achievement),
                lastUpdated: new Date()
            });

            console.log('✅ Achievement unlocked:', achievement);
        } catch (error) {
            console.error('❌ Error adding achievement:', error);
            throw error;
        }
    }

    // Save reflexion for a Lerninhalt
    async saveReflexion(lerninhaltId, reflexionText) {
        if (!this.isLoggedIn()) {
            throw new Error('Not logged in');
        }

        const reflexionRef = doc(this.db, 'reflexionen', this.currentUserCode, 'lerninhalte', lerninhaltId);
        
        try {
            await setDoc(reflexionRef, {
                text: reflexionText,
                lerninhaltId: lerninhaltId,
                createdAt: new Date(),
                lastUpdated: new Date()
            }, { merge: true });

            console.log('✅ Reflexion saved:', lerninhaltId);
        } catch (error) {
            console.error('❌ Error saving reflexion:', error);
            throw error;
        }
    }

    // Get reflexion
    async getReflexion(userCode, lerninhaltId) {
        if (!this.isLoggedIn()) {
            throw new Error('Not logged in');
        }

        const reflexionRef = doc(this.db, 'reflexionen', userCode, 'lerninhalte', lerninhaltId);
        
        try {
            const reflexionDoc = await getDoc(reflexionRef);
            if (reflexionDoc.exists()) {
                return reflexionDoc.data();
            }
            return null;
        } catch (error) {
            console.error('❌ Error getting reflexion:', error);
            throw error;
        }
    }

    // Add emoji reaction to reflexion
    async addReaction(targetUserCode, lerninhaltId, emoji) {
        if (!this.isLoggedIn()) {
            throw new Error('Not logged in');
        }

        const reactionRef = doc(this.db, 'reactions', targetUserCode, 'lerninhalte', lerninhaltId);
        
        try {
            const reactionDoc = await getDoc(reactionRef);
            let reactions = {};

            if (reactionDoc.exists()) {
                reactions = reactionDoc.data().reactions || {};
            }

            // Add or update reaction
            reactions[this.currentUserCode] = {
                emoji: emoji,
                role: this.currentUserRole,
                timestamp: new Date()
            };

            await setDoc(reactionRef, {
                reactions: reactions,
                lastUpdated: new Date()
            }, { merge: true });

            console.log('✅ Reaction added:', emoji);
            return reactions;
        } catch (error) {
            console.error('❌ Error adding reaction:', error);
            throw error;
        }
    }

    // Get reactions for a reflexion
    async getReactions(userCode, lerninhaltId) {
        const reactionRef = doc(this.db, 'reactions', userCode, 'lerninhalte', lerninhaltId);
        
        try {
            const reactionDoc = await getDoc(reactionRef);
            if (reactionDoc.exists()) {
                return reactionDoc.data().reactions || {};
            }
            return {};
        } catch (error) {
            console.error('❌ Error getting reactions:', error);
            return {};
        }
    }

    // Share portfolio with another user
    async sharePortfolio(targetUserCode) {
        if (!this.isLoggedIn()) {
            throw new Error('Not logged in');
        }

        const userRef = doc(this.db, 'users', this.currentUserCode);
        
        try {
            await updateDoc(userRef, {
                shares: arrayUnion(targetUserCode.toUpperCase())
            });

            // Update target user's access
            const targetUserRef = doc(this.db, 'users', targetUserCode.toUpperCase());
            await updateDoc(targetUserRef, {
                [`hasAccessTo.${this.currentUserCode}`]: true
            });

            console.log('✅ Portfolio shared with:', targetUserCode);
        } catch (error) {
            console.error('❌ Error sharing portfolio:', error);
            throw error;
        }
    }

    // Get user progress
    async getUserProgress(userCode = null) {
        const code = userCode || this.currentUserCode;
        if (!code) {
            throw new Error('No user code provided');
        }

        const progressRef = doc(this.db, 'userProgress', code);
        
        try {
            const progressDoc = await getDoc(progressRef);
            if (progressDoc.exists()) {
                return progressDoc.data();
            }
            return null;
        } catch (error) {
            console.error('❌ Error getting progress:', error);
            throw error;
        }
    }

    // Get portfolios that current user has access to
    async getAccessiblePortfolios() {
        if (!this.isLoggedIn()) {
            throw new Error('Not logged in');
        }

        const userRef = doc(this.db, 'users', this.currentUserCode);
        
        try {
            const userDoc = await getDoc(userRef);
            if (userDoc.exists()) {
                const userData = userDoc.data();
                return Object.keys(userData.hasAccessTo || {});
            }
            return [];
        } catch (error) {
            console.error('❌ Error getting accessible portfolios:', error);
            return [];
        }
    }

    // Generate shareable link
    getShareLink(userCode = null) {
        const code = userCode || this.currentUserCode;
        const baseUrl = window.location.origin;
        return `${baseUrl}/portfolio.html?view=${code}`;
    }

    // Save Umsetzungsbeispiel
    async saveUmsetzungsbeispiel(lebensbezugId, data) {
        if (!this.isLoggedIn()) {
            throw new Error('Not logged in');
        }

        const umsetzungRef = doc(this.db, 'umsetzungsbeispiele', this.currentUserCode, 'lebensbezuege', lebensbezugId);
        
        try {
            await setDoc(umsetzungRef, {
                ...data,
                lebensbezugId: lebensbezugId,
                createdAt: new Date(),
                lastUpdated: new Date()
            }, { merge: true });

            console.log('✅ Umsetzungsbeispiel saved:', lebensbezugId);
        } catch (error) {
            console.error('❌ Error saving Umsetzungsbeispiel:', error);
            throw error;
        }
    }

    // Get Umsetzungsbeispiel
    async getUmsetzungsbeispiel(userCode, lebensbezugId) {
        if (!this.isLoggedIn()) {
            throw new Error('Not logged in');
        }

        const umsetzungRef = doc(this.db, 'umsetzungsbeispiele', userCode, 'lebensbezuege', lebensbezugId);
        
        try {
            const umsetzungDoc = await getDoc(umsetzungRef);
            if (umsetzungDoc.exists()) {
                return umsetzungDoc.data();
            }
            return null;
        } catch (error) {
            console.error('❌ Error getting Umsetzungsbeispiel:', error);
            throw error;
        }
    }
}

// Create global instance
window.abuTracker = new ABUTracker();

// Export for module usage
export default ABUTracker;
