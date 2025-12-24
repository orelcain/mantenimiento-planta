import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: "AIzaSyBsJSh6x3ZGEyuXsM18dSWsJKyU7--KJss",
  authDomain: "mantenimiento-planta-771a3.firebaseapp.com",
  projectId: "mantenimiento-planta-771a3",
  storageBucket: "mantenimiento-planta-771a3.firebasestorage.app",
  messagingSenderId: "1019421112530",
  appId: "1:1019421112530:web:9afd9962e0b53152f8d50b",
}

// Inicializar Firebase
const app = initializeApp(firebaseConfig)

// Servicios de Firebase
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)

export default app
