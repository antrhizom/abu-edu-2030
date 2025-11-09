// firebase-auth-service.js
// ABU EBA Firebase Authentication Service

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
    getAuth, 
    signInAnonymously,
    onAuthStateChanged,
    signOut 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc, 
    collection,
    query,
    where,
    getDocs,
    serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import firebaseConfig from './firebase-config.js';

class AbuEbaAuthService {
    constructor() {
        // Initialize Firebase
        this.app = initializeApp(firebaseConfig);
        this.auth = getAuth(this.app);
        this.db = getFirestore(this.app);
        this.currentUser = null;
        
        // Listen to auth state changes
        onAuthStateChanged(this.auth, (user) => {
            this.currentUser = user;
            this.onAuthStateChange(user);
        });
    }

    // Auth state change callback
    onAuthStateChange(user) {
        console.log('Auth state changed:', user ? 'Logged in' : 'Logged out');
    }

    // Check if code exists in Firestore
    async codeExists(code) {
        try {
            const codesRef = collection(this.db, 'userCodes');
            const q = query(codesRef, where('code', '==', code));
            const querySnapshot = await getDocs(q);
            return !querySnapshot.empty;
        } catch (error) {
            console.error('Error checking code:', error);
            throw error;
        }
    }

    // Create new user code
    async createUserCode(code, name, year, symbol, pin) {
        try {
            // Check if code already exists
            const exists = await this.codeExists(code);
            if (exists) {
                throw new Error('CODE_EXISTS');
            }

            // Sign in anonymously first
            const userCredential = await signInAnonymously(this.auth);
            const uid = userCredential.user.uid;

            // Store code in Firestore
            await setDoc(doc(this.db, 'userCodes', code), {
                code: code,
                name: name,
                year: year,
                symbol: symbol,
                pinHash: this.hashPin(pin), // Don't store plain PIN
                uid: uid,
                createdAt: serverTimestamp(),
                lastLogin: serverTimestamp()
            });

            // Store user profile
            await setDoc(doc(this.db, 'users', uid), {
                name: name,
                code: code,
                symbol: symbol,
                year: year,
                createdAt: serverTimestamp(),
                progress: {
                    completedTopics: [],
                    portfolioEntries: 0,
                    points: 0,
                    badges: []
                }
            });

            // Store in localStorage for quick access
            localStorage.setItem('abuEbaCode', code);
            localStorage.setItem('abuEbaName', name);
            localStorage.setItem('abuEbaUid', uid);

            return { success: true, uid: uid };
        } catch (error) {
            console.error('Error creating user code:', error);
            throw error;
        }
    }

    // Login with existing code
    async loginWithCode(code, pin) {
        try {
            // Get code document from Firestore
            const codeDoc = await getDoc(doc(this.db, 'userCodes', code));
            
            if (!codeDoc.exists()) {
                throw new Error('CODE_NOT_FOUND');
            }

            const codeData = codeDoc.data();
            
            // Verify PIN
            if (this.hashPin(pin) !== codeData.pinHash) {
                throw new Error('INVALID_PIN');
            }

            // Sign in anonymously (Firebase Anonymous Auth)
            const userCredential = await signInAnonymously(this.auth);
            const uid = userCredential.user.uid;

            // Update last login
            await setDoc(doc(this.db, 'userCodes', code), {
                lastLogin: serverTimestamp()
            }, { merge: true });

            // Store in localStorage
            localStorage.setItem('abuEbaCode', code);
            localStorage.setItem('abuEbaName', codeData.name);
            localStorage.setItem('abuEbaUid', uid);

            return { success: true, uid: uid, userData: codeData };
        } catch (error) {
            console.error('Error logging in:', error);
            throw error;
        }
    }

    // Get user profile from Firestore
    async getUserProfile(uid) {
        try {
            const userDoc = await getDoc(doc(this.db, 'users', uid));
            if (userDoc.exists()) {
                return userDoc.data();
            }
            return null;
        } catch (error) {
            console.error('Error getting user profile:', error);
            throw error;
        }
    }

    // Update user progress
    async updateProgress(uid, progressData) {
        try {
            await setDoc(doc(this.db, 'users', uid), {
                progress: progressData,
                lastUpdated: serverTimestamp()
            }, { merge: true });
            return { success: true };
        } catch (error) {
            console.error('Error updating progress:', error);
            throw error;
        }
    }

    // Check if user is logged in
    isLoggedIn() {
        return this.currentUser !== null && 
               localStorage.getItem('abuEbaCode') !== null;
    }

    // Get current user data from localStorage
    getCurrentUserData() {
        return {
            code: localStorage.getItem('abuEbaCode'),
            name: localStorage.getItem('abuEbaName'),
            uid: localStorage.getItem('abuEbaUid')
        };
    }

    // Logout
    async logout() {
        try {
            await signOut(this.auth);
            localStorage.removeItem('abuEbaCode');
            localStorage.removeItem('abuEbaName');
            localStorage.removeItem('abuEbaUid');
            return { success: true };
        } catch (error) {
            console.error('Error logging out:', error);
            throw error;
        }
    }

    // Simple PIN hashing (for demo - use proper hashing in production!)
    hashPin(pin) {
        // In production, use a proper hashing library like bcrypt
        // This is just a simple hash for demonstration
        let hash = 0;
        const str = pin + 'ABU_EBA_SALT_2024';
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    }

    // Validate code format
    validateCodeFormat(code) {
        const parts = code.split('-');
        if (parts.length !== 4) return false;
        
        const [name, year, symbol, pin] = parts;
        
        // Check name (only letters)
        if (!/^[A-ZÄÖÜa-zäöü]+$/.test(name)) return false;
        
        // Check year (2 digits)
        if (!/^\d{2}$/.test(year)) return false;
        
        // Check PIN (4 digits)
        if (!/^\d{4}$/.test(pin)) return false;
        
        // Symbol can be any emoji
        return true;
    }
}

// Export singleton instance
const authService = new AbuEbaAuthService();
export default authService;
