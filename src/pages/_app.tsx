import { type AppType } from "next/dist/shared/lib/utils";
import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { trpc } from "utils/trpc";
import "styles/globals.css";
import Head from "next/head";
// import { ReactQueryDevtools } from 'react-query/devtools';

if (typeof window !== 'undefined') {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        new URL('../client/sw/sw.ts', import.meta.url),
        {
          scope: '/',
          type: 'module'
        }
      )
      await registration.update()
      console.log('SW: registered')
    } catch (e) {
      console.log('Service Worker registration failed: ', e)
    }
  }, {once: true})
}

const MyApp: AppType<{ session: Session | null }> = ({
  Component,
  pageProps: { session, ...pageProps },
}) => {
  return (
    <>
      <Head>
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#b145c7" />
        <meta name="theme-color" content="#300a38" />
      </Head>
      {/* <ReactQueryDevtools initialIsOpen={false} /> */}
      <SessionProvider session={session}>
        <Component {...pageProps} />
      </SessionProvider>
    </>
  );
};

export default trpc.withTRPC(MyApp);
