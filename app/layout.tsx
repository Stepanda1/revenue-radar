import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata = {
  title:'Revenue Radar — Find the story in your sales',
  description:'Upload a sales CSV. Find revenue changes, unusual sales days and product trends, then get an evidence-based action plan.',
  icons:{icon:'/favicon.svg',shortcut:'/favicon.svg'}
};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
