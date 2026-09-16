import React, { useEffect, useState } from "react";
import {
  fetchNcrPhotoObjectUrl,
  isLegacyNcrPhotoPath,
  resolveNcrPhotoUrl,
} from "../../Common/Services/QualityService";

type NcrStoredPhotoImgProps = {
  ncrId: number;
  photo: string;
  alt?: string;
};

/** Renders an NCR photo from legacy /uploads path or Azure via authenticated GetNCRPhoto. */
const NcrStoredPhotoImg: React.FC<NcrStoredPhotoImgProps> = ({
  ncrId,
  photo,
  alt = "NCR attachment",
}) => {
  const [src, setSrc] = useState(() => {
    if (isLegacyNcrPhotoPath(photo) && !photo.startsWith("data:") && !photo.startsWith("blob:") && !photo.startsWith("http")) {
      return resolveNcrPhotoUrl(photo);
    }
    if (photo.startsWith("data:") || photo.startsWith("blob:") || photo.startsWith("http")) {
      return photo;
    }
    return "";
  });

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    const needsFetch =
      !!photo &&
      ncrId > 0 &&
      !photo.startsWith("data:") &&
      !photo.startsWith("blob:") &&
      !photo.startsWith("http") &&
      !(photo.replace(/\\/g, "/").startsWith("/uploads/") || photo.replace(/\\/g, "/").startsWith("uploads/"));

    if (!needsFetch) {
      if (photo.replace(/\\/g, "/").startsWith("/uploads/") || photo.replace(/\\/g, "/").startsWith("uploads/")) {
        setSrc(resolveNcrPhotoUrl(photo));
      }
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
      if (objectUrl && objectUrl.startsWith("blob:")) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [ncrId, photo]);

  if (!src) {
    return <div className="photo-preview-placeholder" aria-label={alt} />;
  }

  return <img src={src} alt={alt} />;
};

export default NcrStoredPhotoImg;
