

export async function sleep(ms: number): Promise<undefined> {
  return new Promise<undefined>((resolve) => {
    setTimeout(resolve, ms)
  })
}