import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
  updateProfile,
} from 'firebase/auth'
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  increment,
} from 'firebase/firestore'
import { auth, db } from './firebase'
import type { User, UserRole, InviteCode } from '@/types'

// Iniciar sesión
export async function signIn(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email, password)
  const user = await getUserById(credential.user.uid)
  if (!user) {
    throw new Error('Usuario no encontrado en la base de datos')
  }
  if (!user.activo) {
    await firebaseSignOut(auth)
    throw new Error('Usuario desactivado. Contacte al administrador.')
  }
  return user
}

// Registrar con código de invitación
export async function signUpWithInviteCode(
  email: string,
  password: string,
  nombre: string,
  apellido: string,
  inviteCode: string
): Promise<User> {
  // Verificar código de invitación
  const invite = await validateInviteCode(inviteCode)
  if (!invite) {
    throw new Error('Código de invitación inválido o expirado')
  }

  // Crear usuario en Firebase Auth
  const credential = await createUserWithEmailAndPassword(auth, email, password)
  
  // Actualizar perfil
  await updateProfile(credential.user, {
    displayName: `${nombre} ${apellido}`,
  })

  // Crear documento de usuario
  const userData: User = {
    id: credential.user.uid,
    email,
    nombre,
    apellido,
    rol: invite.rol,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  await setDoc(doc(db, 'users', credential.user.uid), {
    ...userData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  // Incrementar usos del código
  await updateDoc(doc(db, 'inviteCodes', invite.id), {
    usosActuales: increment(1),
  })

  return userData
}

// Crear usuario directamente (solo admin)
export async function createUser(
  email: string,
  password: string,
  nombre: string,
  apellido: string,
  rol: UserRole
): Promise<User> {
  // Crear usuario en Firebase Auth
  const credential = await createUserWithEmailAndPassword(auth, email, password)
  
  // Actualizar perfil
  await updateProfile(credential.user, {
    displayName: `${nombre} ${apellido}`,
  })

  // Crear documento de usuario
  const userData: User = {
    id: credential.user.uid,
    email,
    nombre,
    apellido,
    rol,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  await setDoc(doc(db, 'users', credential.user.uid), {
    ...userData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return userData
}

// Cerrar sesión
export async function signOut(): Promise<void> {
  await firebaseSignOut(auth)
}

// Obtener usuario por ID
export async function getUserById(userId: string): Promise<User | null> {
  const docRef = doc(db, 'users', userId)
  const docSnap = await getDoc(docRef)
  
  if (!docSnap.exists()) {
    return null
  }

  const data = docSnap.data()
  return {
    id: docSnap.id,
    ...data,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
  } as User
}

// Validar código de invitación
export async function validateInviteCode(code: string): Promise<InviteCode | null> {
  const q = query(
    collection(db, 'inviteCodes'),
    where('code', '==', code.toUpperCase()),
    where('activo', '==', true)
  )
  
  const snapshot = await getDocs(q)
  
  if (snapshot.empty) {
    return null
  }

  const docSnap = snapshot.docs[0]
  if (!docSnap) {
    return null
  }
  
  const data = docSnap.data()
  const invite: InviteCode = {
    id: docSnap.id,
    code: data.code,
    rol: data.rol,
    usosMaximos: data.usosMaximos,
    usosActuales: data.usosActuales,
    activo: data.activo,
    createdBy: data.createdBy,
    createdAt: data.createdAt?.toDate() || new Date(),
    expiresAt: data.expiresAt?.toDate(),
  }

  // Verificar si no ha expirado
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return null
  }

  // Verificar si no ha alcanzado el máximo de usos
  if (invite.usosActuales >= invite.usosMaximos) {
    return null
  }

  return invite
}

// Crear código de invitación
export async function createInviteCode(
  rol: UserRole,
  usosMaximos: number,
  createdBy: string,
  expiresInDays?: number
): Promise<InviteCode> {
  const code = generateInviteCode()
  
  const inviteData: Omit<InviteCode, 'id'> = {
    code,
    rol,
    usosMaximos,
    usosActuales: 0,
    activo: true,
    createdBy,
    createdAt: new Date(),
    expiresAt: expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : undefined,
  }

  const docRef = doc(collection(db, 'inviteCodes'))
  await setDoc(docRef, {
    ...inviteData,
    createdAt: serverTimestamp(),
  })

  return {
    id: docRef.id,
    ...inviteData,
  }
}

// Generar código aleatorio
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

// Escuchar cambios en el estado de autenticación
export function onAuthChange(callback: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, callback)
}

// Obtener usuario actual
export function getCurrentUser(): FirebaseUser | null {
  return auth.currentUser
}
