import type { NextPage } from "next"
import Head from "next/head"
import AudioTest from "../components/AudioTest"


const Home: NextPage = () => {
  return (
    <>
      <Head>
        <title>Soft Serve Tunes</title>
        <meta name="description" content="self hosted music streaming" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <AudioTest />
    </>
  )
}

export default Home;
