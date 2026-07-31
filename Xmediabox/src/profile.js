const PROFILE_KEY = 'xmediabox-profile-v1'

export function readProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return { nickname: '', onboarded: false }
    const data = JSON.parse(raw)
    return {
      nickname: String(data?.nickname || '').trim(),
      onboarded: Boolean(data?.onboarded),
    }
  } catch {
    return { nickname: '', onboarded: false }
  }
}

export function saveProfile(next) {
  const profile = {
    nickname: String(next?.nickname || '').trim(),
    onboarded: Boolean(next?.onboarded ?? true),
  }
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  return profile
}

export function brandName(nickname) {
  const name = String(nickname || '').trim()
  return name || 'X'
}

export function brandTitle(nickname) {
  return `${brandName(nickname)} Media Box`
}
