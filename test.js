
const crypto = require('crypto');

void async function() {
	const {parseFile} = await import('./node_modules/music-metadata/lib/index.js');
	const data = await parseFile("/Users/Flo/Music/10 G.O.A.T..mp3")
	console.log(data.common.picture[0].data)
	
	const buf = Buffer.from(data.common.picture[0].data)
	
	const hashed = crypto
		.createHash('md5')
		.update(buf)
		.digest("hex")

	console.log(hashed)
}()