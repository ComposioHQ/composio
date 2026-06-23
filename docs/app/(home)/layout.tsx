import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';
import { EveChat } from '@/components/eve-chat';

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <HomeLayout {...baseOptions()}>
      {children}
      <EveChat />
    </HomeLayout>
  );
}
