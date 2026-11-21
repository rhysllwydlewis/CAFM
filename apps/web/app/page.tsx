import { redirect } from 'next/navigation';

// The marketing homepage comes later (doc 06); for now the root goes to sign-in.
export default function Root() {
  redirect('/login');
}
