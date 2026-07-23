import { getStorage } from '@reelforge/storage';
import type { Job, Video } from '@reelforge/db';
import { toJobDto, type JobDto } from './job-dto';

/** Build a JobDto, resolving signed/authenticated storage URLs for its video (if any). */
export async function jobToDto(job: Job & { video?: Video | null }): Promise<JobDto> {
  const video = job.video ?? null;
  if (!video) return toJobDto(job, null);
  const storage = getStorage();
  const [mp4Url, thumbUrl] = await Promise.all([
    storage.url(video.storageKeyMp4),
    storage.url(video.storageKeyThumb),
  ]);
  return toJobDto(job, video, { mp4Url, thumbUrl });
}
