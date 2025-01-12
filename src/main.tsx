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

const AGENT_ID = 'f9473937-3a5e-0c90-ba50-7c075effad23' // this comes from the agentId output from running the Eliza framework, it likely will be in uuid format, i.e. '123e4567-e89b-12d3-a456-426614174000'
const SIMLI_FACE_ID = '1373a78a-29a9-4ebf-8249-c1639f6301ba'
const ELEVENLABS_VOICE_ID = 'QVdfyuce5vtARk1420LS'

const simliClient = new SimliClient()

const App = () => {
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState('')
  const [_, setChatgptText] = useState('')
  const [startWebRTC, setStartWebRTC] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const cancelTokenRef = useRef<any | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioContextRef = useRef<any | null>(null)
  const analyserRef = useRef<any | null>(null)
  const microphoneRef = useRef<any | null>(null)

  // TODO: populate these from localStorage if roomid and useruuid are set, otherwise generate a random uuid
  const [roomID, setRoomID] = useState('')
  const [userUUID, setUserUUID] = useState('')

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

  const toggleListening = useCallback(() => {
    if (isListening) {
      console.log('Stopping mic')
      stopListening()
    } else {
      console.log('Starting mic')
      startListening()
    }
  }, [isListening])

  const sendAudioToWhisper = useCallback(
    async (audioBlob: Blob) => {
      const formData = new FormData()
      formData.append('file', audioBlob, 'audio.wav')

      try {
        const response = await axios.post(`${completionEndpoint}/${AGENT_ID}/whisper`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        })

        const transcribedText = response.data.text
        await processInput(transcribedText)
      } catch (error) {
        console.error('Error transcribing audio:', error)
        setError('Error transcribing audio. Please try again.')
      }
    },
    [processInput]
  )

  const startListening = useCallback(() => {
    setIsListening(true)
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext ||
            (window as any).webkitAudioContext)()
        }

        if (!analyserRef.current) {
          analyserRef.current = audioContextRef.current.createAnalyser()
          analyserRef.current.fftSize = 512
        }

        if (microphoneRef.current) {
          microphoneRef.current.disconnect()
        }

        microphoneRef.current = audioContextRef.current.createMediaStreamSource(stream)
        microphoneRef.current.connect(analyserRef.current)

        mediaRecorderRef.current = new MediaRecorder(stream)
        mediaRecorderRef.current.ondataavailable = (event) => {
          console.log('Data available:', event.data)
          chunksRef.current.push(event.data)
        }
        mediaRecorderRef.current.onstop = () => {
          console.log('Recorder stopped')
          const audioBlob = new Blob(chunksRef.current, { type: 'audio/wav' })
          sendAudioToWhisper(audioBlob)
          chunksRef.current = []
        }
        mediaRecorderRef.current.start()
      })
      .catch((err) => {
        console.error('Error accessing microphone:', err)
        setIsListening(false)
        setError('Error accessing microphone. Please check your permissions and try again.')
      })
  }, [sendAudioToWhisper])

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    console.log('Stopping listening')
    setIsListening(false)
  }, [])

  useEffect(() => {
    console.log('isListening', isListening)
    console.log('chunksRef.current', chunksRef.current)

    if (!isListening && chunksRef.current.length > 0) {
      console.log('Sending audio to Whisper')
      const audioBlob = new Blob(chunksRef.current, { type: 'audio/wav' })
      sendAudioToWhisper(audioBlob)
      chunksRef.current = []
    }
  }, [isListening, sendAudioToWhisper])

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
      <div className='flex h-screen w-full flex-col items-center justify-center font-mono text-white bg-[#C0C0C0]'>
        <video
          autoPlay
          loop
          muted
          playsInline
          className='absolute inset-0 w-full h-full object-cover'
        >
          <source src='/bg.mp4' type='video/mp4' />
        </video>
        <div className={`relative w-[30%] ${startWebRTC && !isConnecting ? '' : 'hidden'}`}>
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
            <a href="https://x.com/YEIwtf" className='absolute bottom-4 right-4 text-black'>
              <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="50" height="50" viewBox="0 0 50 50">
                <path d="M 11 4 C 7.1456661 4 4 7.1456661 4 11 L 4 39 C 4 42.854334 7.1456661 46 11 46 L 39 46 C 42.854334 46 46 42.854334 46 39 L 46 11 C 46 7.1456661 42.854334 4 39 4 L 11 4 z M 11 6 L 39 6 C 41.773666 6 44 8.2263339 44 11 L 44 39 C 44 41.773666 41.773666 44 39 44 L 11 44 C 8.2263339 44 6 41.773666 6 39 L 6 11 C 6 8.2263339 8.2263339 6 11 6 z M 13.085938 13 L 22.308594 26.103516 L 13 37 L 15.5 37 L 23.4375 27.707031 L 29.976562 37 L 37.914062 37 L 27.789062 22.613281 L 36 13 L 33.5 13 L 26.660156 21.009766 L 21.023438 13 L 13.085938 13 z M 16.914062 15 L 19.978516 15 L 34.085938 35 L 31.021484 35 L 16.914062 15 z"></path>
              </svg>
            </a>
            {/* {chatgptText && <p className='text-center'>{chatgptText}</p>} */}
            <form
              onSubmit={handleSubmit}
              className="fixed bottom-4 left-1/2 transform -translate-x-1/2 flex justify-center w-full max-w-md space-x-2 px-4"
            >
              <div className="flex items-center space-x-2">
                <Window>
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="talk to ye"
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
                Connecting...
              </p>
            )}
            {!isConnecting && (
              <div className='h-screen w-screen flex flex-col justify-center items-center relative bg-black'>
                <div className='z-10 group rounded-full border border-black/5 bg-neutral-100 text-base md:text-lg lg:text-xl text-white transition-all ease-in hover:cursor-pointer hover:bg-neutral-200 dark:border-white/5 dark:bg-neutral-900 dark:hover:bg-neutral-800 mb-8 md:mb-16'>
                  <div className="inline-flex items-center justify-center px-4 py-1 transition ease-out text-neutral-600">
                    <span>version 0.1</span>
                  </div>
                </div>

                <div className="z-10 text-white font-custom text-xl md:text-3xl lg:text-5xl xl:text-6xl mb-4">
                  Kan(ye) Intelligence
                </div>

                <button
                  disabled={isConnecting}
                  onClick={handleStart}
                  className="z-10 bg-white text-black font-semibold px-6 py-2 rounded-full mt-4 md:mt-10 md:text-xl lg:text-3xl md:hover:bg-neutral-600 md:hover:text-white transition duration-100"
                >
                  access
                </button>

                <div className="absolute inset-0 pointer-events-none">
                  <div className="bg-repeat w-full h-full opacity-50" style={{ backgroundImage: "url('/k2.gif')" }}></div>
                </div>
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