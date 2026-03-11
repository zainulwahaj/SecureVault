'use client';

import { PageLoader } from './page-loader';

export default function LogoLoader() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background">
      <PageLoader />
    </div>
  );
}
