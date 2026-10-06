import { describe, expect, it } from "vitest"
import { parseYouTubeLink } from "./youtube.ts"

describe("parseYouTubeLink", () => {
	it("parses the common link shapes", () => {
		expect(parseYouTubeLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.videoID).toBe("dQw4w9WgXcQ")
		expect(parseYouTubeLink("https://youtu.be/dQw4w9WgXcQ?si=abc")?.videoID).toBe("dQw4w9WgXcQ")
		expect(parseYouTubeLink("https://youtube.com/shorts/R0KZIPOqITw")?.videoID).toBe("R0KZIPOqITw")
		expect(parseYouTubeLink("https://m.youtube.com/live/R0KZIPOqITw?feature=share")?.videoID).toBe("R0KZIPOqITw")
		expect(parseYouTubeLink("https://music.youtube.com/watch?v=dQw4w9WgXcQ")?.isMusic).toBe(true)
	})

	it("reads timestamps", () => {
		expect(parseYouTubeLink("https://youtu.be/dQw4w9WgXcQ?t=90")?.start).toBe(90)
		expect(parseYouTubeLink("https://youtu.be/dQw4w9WgXcQ?t=1m30s")?.start).toBe(90)
		expect(parseYouTubeLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=2h")?.start).toBe(7200)
		expect(parseYouTubeLink("https://youtu.be/dQw4w9WgXcQ?t=junk")?.start).toBeUndefined()
	})

	it("rejects non-video links", () => {
		expect(parseYouTubeLink("https://www.youtube.com/@channel")).toBeNull()
		expect(parseYouTubeLink("https://www.youtube.com/watch")).toBeNull()
		expect(parseYouTubeLink("https://notyoutube.com/watch?v=dQw4w9WgXcQ")).toBeNull()
		expect(parseYouTubeLink("https://youtu.be/bad%22id")).toBeNull()
		expect(parseYouTubeLink("not a url")).toBeNull()
	})
})
