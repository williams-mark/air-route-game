// Steamworks integration arrives in a later lane. These stubs keep the bridge contract stable.
export async function steamAvailable(): Promise<boolean> {
  return false;
}

export async function unlockAchievement(_id: string): Promise<boolean> {
  return false;
}
