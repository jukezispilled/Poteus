import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createGlobalStyle, ThemeProvider } from 'styled-components';
import { Window, styleReset } from 'react95';
import original from 'react95/dist/themes/original';
import ms_sans_serif from 'react95/dist/fonts/ms_sans_serif.woff2';
import ms_sans_serif_bold from 'react95/dist/fonts/ms_sans_serif_bold.woff2';

import ReactDOM from 'react-dom/client'
import axios from 'axios'
import { v4 as uuidv4 } from 'uuid'
import MarqueeComponent from './Marquee';

import { SimliClient } from './SimliClient'

const GlobalStyles = createGlobalStyle`
  ${styleReset}
  @font-face {
    font-family: 'ms_sans_serif';
    src: url('${ms_sans_serif}') format('woff2');
    font-weight: 400;
    font-style: normal
  }
  @font-face {
    font-family: 'ms_sans_serif';
    src: url('${ms_sans_serif_bold}') format('woff2');
    font-weight: bold;
    font-style: normal
  }
  body {
    font-family: 'ms_sans_serif';
  }
`;

const sk = import.meta.env.VITE_SIMLI_API_KEY
const e11 = import.meta.env.VITE_ELEVENLABS_API_KEY

const completionEndpoint = import.meta.env?.VITE_COMPLETION_ENDPOINT || 'http://localhost:3000'

import './styles.css'

const AGENT_ID = 'e0e10e6f-ff2b-0d4c-8011-1fc1eee7cb32' // this comes from the agentId output from running the Eliza framework, it likely will be in uuid format, i.e. '123e4567-e89b-12d3-a456-426614174000'
const SIMLI_FACE_ID = 'b8ef6b37-bcb0-4a74-b712-13530a477dd2'
const ELEVENLABS_VOICE_ID = 'UNp0QMV47KW9Kr2tPU1G'

const simliClient = new SimliClient()

const App = () => {
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState('')
  const [_, setChatgptText] = useState('')
  const [startWebRTC, setStartWebRTC] = useState(false)
  const cancelTokenRef = useRef<any | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // TODO: populate these from localStorage if roomid and useruuid are set, otherwise generate a random uuid
  const [roomID, setRoomID] = useState('')
  const [userUUID, setUserUUID] = useState('')
  const [copied, setCopied] = useState(false);
  const ca = 'XXXXXXXXXX';

  const handleCopy = () => {
    navigator.clipboard.writeText(ca).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reset the copied state after 2 seconds
    });
  };

  useEffect(() => {
    const storedRoomID = localStorage.getItem('roomID')
    const storedUserUUID = localStorage.getItem('userUUID')
    if (storedRoomID && storedUserUUID) {
      setRoomID(storedRoomID)
      setUserUUID(storedUserUUID)
    } else {
      const newRoomID = uuidv4()
      const newUserUUID = uuidv4()
      setRoomID(newRoomID)
      setUserUUID(newUserUUID)
      localStorage.setItem('roomID', newRoomID)
      localStorage.setItem('userUUID', newUserUUID)
    }
  }, [])

  const initializeSimliClient = useCallback(() => {
    if (videoRef.current && audioRef.current) {
      const SimliConfig = {
        apiKey: sk,
        faceID: SIMLI_FACE_ID,
        handleSilence: true,
        videoRef: videoRef,
        audioRef: audioRef,
      }

      simliClient.Initialize(SimliConfig)
      console.log('Simli Client initialized')
    }
  }, [])

  useEffect(() => {
    initializeSimliClient()

    const handleConnected = () => {
      console.log('SimliClient is now connected!')
    }

    const handleDisconnected = () => {
      console.log('SimliClient has disconnected!')
    }

    const handleFailed = () => {
      console.log('SimliClient has failed to connect!')
      setError('Failed to connect to Simli. Please try again.')
    }

    const handleStarted = () => {
      console.log('SimliClient has started!')
      setIsLoading(false)
      setIsConnecting(false)
    }

    simliClient.on('connected', handleConnected)
    simliClient.on('disconnected', handleDisconnected)
    simliClient.on('failed', handleFailed)
    simliClient.on('started', handleStarted)

    return () => {
      simliClient.off('connected', handleConnected)
      simliClient.off('disconnected', handleDisconnected)
      simliClient.off('failed', handleFailed)
      simliClient.off('started', handleStarted)
      simliClient.close()
    }
  }, [initializeSimliClient])

  const handleStart = useCallback(() => {
    simliClient.start()
    setStartWebRTC(true)
    setIsLoading(true)
    setIsConnecting(true)

    setTimeout(() => {
      const audioData = new Uint8Array(6000).fill(0)
      simliClient.sendAudioData(audioData)
    }, 4000)
  }, [])

  const processInput = useCallback(async (text: any) => {
    setIsLoading(true)
    setError('')

    if (cancelTokenRef.current) {
      cancelTokenRef.current.cancel('Operation canceled by the user.')
    }

    cancelTokenRef.current = axios.CancelToken.source()

    try {
      console.log('sending input to chatgpt')
      const chatGPTResponse = await axios.post(
        completionEndpoint + `/${AGENT_ID}/message`,
        {
          text,
          roomId: roomID,
          userId: userUUID,
          userName: 'User',
        },
        {
          cancelToken: cancelTokenRef.current.token,
        }
      )

      console.log('chatGPTResponse', chatGPTResponse)

      const chatGPTText = chatGPTResponse.data[0].text
      if (!chatGPTText || chatGPTText.length === 0) {
        setError('No response from chatGPT. Please try again.')
        return
      }
      setChatgptText(chatGPTText)

      const elevenlabsResponse = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=pcm_16000`,
        {
          text: chatGPTText,
          model_id: 'eleven_turbo_v2_5',
        },
        {
          headers: {
            'xi-api-key': e11,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
          cancelToken: cancelTokenRef.current.token,
        }
      )

      const pcm16Data = new Uint8Array(elevenlabsResponse.data)
      const chunkSize = 6000
      for (let i = 0; i < pcm16Data.length; i += chunkSize) {
        const chunk = pcm16Data.slice(i, i + chunkSize)
        simliClient.sendAudioData(chunk)
      }
    } catch (err) {
      if (axios.isCancel(err)) {
        console.log('Request canceled:', err.message)
      } else {
        setError('An error occurred. Please try again.')
        console.error(err)
      }
    } finally {
      setIsLoading(false)
      cancelTokenRef.current = null
    }
  }, [])

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const input = inputText.trim()
      setInputText('')
      await processInput(input)
    },
    [inputText, processInput]
  )

  return (
    <>
      <GlobalStyles />
      <ThemeProvider theme={original}>
      <div
        className="flex h-screen w-full flex-col items-center justify-center font-mono text-white"
        style={{ backgroundImage: 'url(/b.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <div className='absolute h-full w-full bg-black opacity-60'></div>
        <div className={`relative w-[75%] md:w-[30%] ${startWebRTC && !isConnecting ? '' : 'hidden'}`}>
          <Window>
            <video
              ref={videoRef}
              id='simli_video'
              autoPlay
              playsInline
              className='size-full object-cover'
            ></video>
          </Window>
          <audio ref={audioRef} id='simli_audio' autoPlay></audio>
        </div>
        {startWebRTC && !isConnecting ? (
          <>
            <div className='w-screen absolute top-0'>
              <MarqueeComponent />
            </div>
            {/* {chatgptText && <p className='text-center'>{chatgptText}</p>} */}
            <form
              onSubmit={handleSubmit}
              className="fixed bottom-4 left-1/2 transform -translate-x-1/2 flex justify-center w-full max-w-md space-x-2 px-4"
            >
              <div className="flex items-center space-x-2 relative">
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] md:text-xs whitespace-nowrap">
                  *response may take a few seconds with high demand
                </div>
                <Window>
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="talk to potius"
                    className="grow bg-black px-3 py-2 text-white outline-none focus:outline-none focus:ring-0"
                  />
                </Window>
                <Window>
                  <button
                    type="submit"
                    disabled={isLoading || !inputText.trim()}
                    className="bg-white px-3 py-2 font-bold text-black transition-colors focus:outline-none disabled:opacity-50"
                  >
                    {isLoading ? 'Send' : 'Send'}
                  </button>
                </Window>
              </div>
            </form>
          </>
        ) : (
          <>
            {isConnecting && (
              <p className='fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white'>
                Uploading Potius...
              </p>
            )}
            {!isConnecting && (
              <div
                className="h-screen w-screen flex flex-col justify-center items-center relative"
                style={{ backgroundImage: 'url(/b.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
              >
                <div className='absolute top-4 left-1/2 -translate-x-1/2 bg-white text-[#D1B28E] z-10 px-2 py-1.5 rounded-full'>
                <button
                  onClick={handleCopy}
                  className='p-1.5 text-xs md:text-base m-1 bg-[#D1B28E] font-mono rounded-full text-white'
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <span className='p-1 text-[9px] md:text-base font-mono'>{ca}</span>
                </div>
                <div className='absolute h-full w-full bg-black opacity-60'></div>
                <div className='z-10 group rounded-full border border-black/5 bg-neutral-100 text-base md:text-lg lg:text-xl text-white transition-all ease-in hover:cursor-pointer hover:bg-neutral-200 dark:border-white/5 dark:bg-neutral-900 dark:hover:bg-neutral-800 mb-6 md:mb-12'>
                  <div className="inline-flex items-center justify-center px-4 py-1 transition ease-out text-[#D1B28E]">
                    <span>version 0.1</span>
                  </div>
                </div>

                <div className="z-10 text-[#D1B28E] font-custom text-4xl md:text-7xl lg:text-8xl xl:text-9xl mb-1">
                  Potius Maximus
                </div>

                <button
                  disabled={isConnecting}
                  onClick={handleStart}
                  className="z-10 bg-white text-[#D1B28E] font-semibold px-6 py-2 rounded-full mt-2 md:mt-6 md:text-2xl lg:text-4xl md:hover:bg-[#D1B28E] md:hover:text-white transition duration-100"
                >
                  access
                </button>
                <a href="https://x.com/potiusmaximus" className='absolute bottom-4 right-4 text-black'>
                  <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="50" height="50" viewBox="0 0 50 50" fill='#FFFFFF'>
                    <path d="M 11 4 C 7.1456661 4 4 7.1456661 4 11 L 4 39 C 4 42.854334 7.1456661 46 11 46 L 39 46 C 42.854334 46 46 42.854334 46 39 L 46 11 C 46 7.1456661 42.854334 4 39 4 L 11 4 z M 11 6 L 39 6 C 41.773666 6 44 8.2263339 44 11 L 44 39 C 44 41.773666 41.773666 44 39 44 L 11 44 C 8.2263339 44 6 41.773666 6 39 L 6 11 C 6 8.2263339 8.2263339 6 11 6 z M 13.085938 13 L 22.308594 26.103516 L 13 37 L 15.5 37 L 23.4375 27.707031 L 29.976562 37 L 37.914062 37 L 27.789062 22.613281 L 36 13 L 33.5 13 L 26.660156 21.009766 L 21.023438 13 L 13.085938 13 z M 16.914062 15 L 19.978516 15 L 34.085938 35 L 31.021484 35 L 16.914062 15 z"></path>
                  </svg>
                </a>
              </div>
            )}
          </>
        )}
        {error && <p className='fixed bottom-20 mt-4 text-center text-red-500'>{error}</p>}
      </div>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'black',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          zIndex: -1000,
        }}
      />
    </ThemeProvider>
    </>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)