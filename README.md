# Memrise Audio Provider

Userscript which creates generates audio for any items you are learning which have none.

### Installation

The easiest method is through an extension/add-on on chrome/firefox:

- Chrome: install the [Tampermonkey](https://chrome.google.com/webstore/detail/dhdgffkkebhmkfjojejmpbldmpobfkfo) extension
- Firefox: install the [Greasemonkey](https://addons.mozilla.org/en-US/firefox/addon/greasemonkey/) add-on

Then add the script using the following link: https://github.com/cooljingle/memrise-audio-provider/raw/master/Memrise_Audio_Provider.user.js

### Usage
Once the script is installed and enabled, you can simply continue your learning on memrise and the script will kick in whenever required. You can access some script options via clicking the Audio Provider link in the left side bar:

<img alt="options" src="images/options.png" width="50%" />

* _audio for this course_ - pick which column the script uses to generate audio for the course
* _Voice RSS key_ - API key for Voice RSS (see next section)

### Audio Generation
The script has three different methods to generate audio:

* [Speech Synthesis API](https://developers.google.com/web/updates/2014/01/Web-apps-that-talk-Introduction-to-the-Speech-Synthesis-API?hl=en)
* [Google TTS API](http://techcrunch.com/2009/12/14/the-unofficial-google-text-to-speech-api/)
* [Voice RSS](http://www.voicerss.org/)

Speech Synthesis is available on chrome on a select number of languages. For firefox it currently works (firefox 44+) for English and Mandarin Chinese, but also requires you to navigate to **about:config** and set **media.webspeech.synth.enabled** to **true**.

Failing this, the script will try generating audio via google's tts api. This has support for a large number of languages, but the audio generation may drop out temporarily as google has imposed limits to prevent abuse of the system.

Voice RRS is the last port of call; to use it you will have to go to http://www.voicerss.org/ and register an account. Once this is done you will receive an API key which you will need to input into the audio options; it provides 350 free requests per day.

### Issues

If you come across any issues or have a suggestion you can leave your feedback in the forum thread: http://www.memrise.com/thread/1745286/
