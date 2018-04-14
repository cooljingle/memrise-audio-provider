# Memrise Audio Provider

Userscript which provides audio for any items you are learning which have none.

### Installation

The easiest method is through the Tampermonkey [chrome extension](https://chrome.google.com/webstore/detail/dhdgffkkebhmkfjojejmpbldmpobfkfo) / [firefox addon](https://addons.mozilla.org/firefox/addon/tampermonkey/).

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

Speech Synthesis is available on chrome on a select number of languages. For firefox it currently works (firefox 44+) for English and Mandarin Chinese, but also requires you to navigate to **about:config** and set **media.webspeech.synth.enabled** to **true**. (Update - this was set to true by default in firefox 49)

Failing this, the script will try generating audio via google's tts api. This has support for a large number of languages, but the audio generation may drop out temporarily as google has imposed limits to prevent abuse of the system.

Voice RRS is the last port of call; to use it you will have to go to http://www.voicerss.org/ and register an account. Once this is done you will receive an API key which you will need to input into the audio options; it provides 350 free requests per day.

### Issues

If you come across any issues or have a suggestion you can leave your feedback in the forum thread: https://community.memrise.com/t/userscript-memrise-audio-provider/10133
