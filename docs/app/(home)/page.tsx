import { permanentRedirect } from 'next/navigation';

export default function HomePage() {
  permanentRedirect('/docs');
}
