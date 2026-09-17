import { useEffect, useState } from "react";
import {
  fetchNcrPhotoObjectUrl,
  resolveNcrPhotoUrl,
} from "../../services/qualityService";

type Props = {
  ncrId: number;
  photo: string;
  className?: string;
};

export function NcrStoredPhotoImg({ ncrId, photo, className }: Props) {
  const [src, setSrc] = useState(() => {
    if (
      photo.startsWith("data:") ||
      photo.startsWith("blob:") ||
      photo.startsWith("http") ||
      photo.replace(/\\/g, "/").startsWith("/uploads/") ||
      photo.replace(/\\/g, "/").startsWith("uploads/")
    ) {
      return resolveNcrPhotoUrl(photo);
    }
    return "";
  });

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    const normalized = photo.replace(/\\/g, "/");
    const needsFetch =
      !!photo &&
      ncrId > 0 &&
      !photo.startsWith("data:") &&
      !photo.startsWith("blob:") &&
      !photo.startsWith("http") &&
      !normalized.startsWith("/uploads/") &&
      !normalized.startsWith("uploads/");

    if (!needsFetch) {
      setSrc(resolveNcrPhotoUrl(photo));
      return;
    }

    fetchNcrPhotoObjectUrl(ncrId, photo)
      .then((url) => {
        if (cancelled) {
          if (url.startsWith("blob:")) URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc("");
      });

    return () => {
      cancelled = true;
      if (objectUrl?.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
    };
  }, [ncrId, photo]);

  if (!src) return <div className={className} />;
  return <img src={src} alt="" className={className} />;
}
