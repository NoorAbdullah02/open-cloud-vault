import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://noor-cloud-vault.onrender.com/api';
    const res = await fetch(`${apiUrl}/shares/public/${token}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return {
        title: 'Shared on NOOR DRIVE',
        description: 'Secure cloud storage and sharing powered by NOOR DRIVE.',
      };
    }
    const data = await res.json();
    const isFile = data.type === 'file';
    const name = isFile ? data.file?.name : data.folder?.name;
    const title = name ? `${name} — NOOR DRIVE` : 'Shared on NOOR DRIVE';
    const description = isFile
      ? `View and download "${name}" securely on NOOR DRIVE.`
      : `Explore and download files in "${name}" securely on NOOR DRIVE.`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        siteName: 'NOOR DRIVE Cloud Vault',
        type: 'website',
      },
      twitter: {
        card: 'summary',
        title,
        description,
      },
    };
  } catch {
    return {
      title: 'Shared on NOOR DRIVE',
      description: 'Secure cloud storage and sharing powered by NOOR DRIVE.',
    };
  }
}

export default function ShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
