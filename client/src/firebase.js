// Firebase initialization and Storage upload helper
import { getAnalytics } from 'firebase/analytics'
import { initializeApp } from 'firebase/app'
import { getDownloadURL, getStorage, ref as storageRef, uploadBytesResumable } from 'firebase/storage'

const firebaseConfig = {
  apiKey: 'AIzaSyBrzxY4sc2BC_5y1ymax08DkHbVoEKDo-8',
  authDomain: 'hana-mediabox.firebaseapp.com',
  projectId: 'hana-mediabox',
  storageBucket: 'hana-mediabox.appspot.com',
  messagingSenderId: '334684002373',
  appId: '1:334684002373:web:b36dada39c02f415bc6b2c',
  measurementId: 'G-W1CXBBMWC0',
}

const app = initializeApp(firebaseConfig)
let analytics
try {
  analytics = getAnalytics(app)
} catch (e) {
  // analytics may fail in non-browser envs — ignore
}

const storage = getStorage(app) 

export async function uploadFileToFirebase(file, onProgress) { 
  const path = `uploads/${Date.now()}_${file.name}`
  const ref = storageRef(storage, path)
  const task = uploadBytesResumable(ref, file)

  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
        onProgress?.(pct)
      },
      (err) => reject(err),
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref)
          resolve({ url, path })
        } catch (e) {
          reject(e)
        }
      },
    )
  })
}

export { analytics, app, storage }


