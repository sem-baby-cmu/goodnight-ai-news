"""Pilot run, round 1: scripts written by Claude Opus 5.5 following prompts/storyteller_v4.md,
one call per story per age level (6 calls). Saved here as compact data, then written to outputs/*.json.
Sentence tuple: (tag, text) or (tag, text, source_quote).
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
SLOTS = ["cover", "character", "news_discovery", "exploration", "challenge",
         "turning_point", "resolution", "reflection", "real_world_facts", "quiz"]


def build(story_id, age, title, rating, themes, links, pages, parent_card, key_facts):
    out_pages = []
    for slot, (tone, scene, sents) in zip(SLOTS, pages):
        ss = []
        for s in sents:
            d = {"tag": s[0], "text": s[1]}
            if len(s) > 2:
                d["source_quote"] = s[2]
            ss.append(d)
        out_pages.append({"slot": slot, "sentences": ss, "scene_description": scene, "tone_tag": tone})
    return {"story_id": story_id, "age_level": age, "title": title, "source_links": links,
            "first_rating": rating, "review_status": "draft", "themes": themes,
            "pages": out_pages, "parent_card": parent_card, "key_facts": key_facts}


QUIZ = ("excited", "Pip holds up three glowing cards.", [("imagine", "Quiz time! Let's see what you remember.")])

PRAISE_LINK = ["https://www.cs.cmu.edu/news/2026/microsoft-cmu-praise"]
DUET_LINK = ["https://www.engadget.com/2293646/claude-duet-is-anthropics-answer-to-meta-muse-and-"]
STORM_LINK = ["https://thehackernews.com/2026/10/china-linked-hackers-use-artex-ai.html"]

PRAISE_CARD = {
    "concept": "AI tools help people work, but people still need to learn and grow.",
    "background": "Carnegie Mellon and Microsoft started PRAISE, a program where new software engineers take classes and get coached by senior engineers on using AI tools well.",
    "question": "Who is someone who helps you learn new things?",
    "honest_answer": "Even with smart AI tools, people learn best with teachers and helpers. A Microsoft leader said AI does not remove the need for new engineers."}
PRAISE_FACTS = ["Carnegie Mellon and Microsoft started a program called PRAISE.",
                "New engineers in PRAISE get coaching from senior engineers.",
                "A Microsoft leader said AI does not remove the need for new engineers."]

DUET_CARD = {
    "concept": "An AI agent is an AI that can do tasks for you, not just answer questions.",
    "background": "Anthropic launched Claude Duet, an AI agent that plans tasks from your apps and checks with you before it acts.",
    "question": "Why is it good for a helper to ask before doing something for you?",
    "honest_answer": "Asking first keeps you in charge. Helpers can make mistakes, so checking first stops a small mistake from becoming a big one."}
DUET_FACTS = ["Anthropic made an AI agent called Claude Duet.",
              "Claude Duet checks with you before it acts.",
              "Claude Duet never directly sees your passwords."]

STORM_CARD = {
    "concept": "Bad actors can use AI too, so people and companies need good digital locks.",
    "background": "Microsoft said a hacker group used an AI agent to guess passwords very fast and break into a backup service called ConnectWise Cloud Backup.",
    "question": "Why do you think we keep our passwords secret?",
    "honest_answer": "Some people try to break into computers. Strong, secret passwords and good security teams help keep our things safe."}
STORM_FACTS = ["Microsoft said hackers used an AI agent in an attack.",
               "The AI tried to guess passwords very fast.",
               "ConnectWise turned off some services to stay safe."]

STORIES = [
    build("praise", "5to7", "Pip and the Helper School", "green", ["curiosity", "teamwork"], PRAISE_LINK, [
        ("warm", "Pip the robot owl on a moonlit windowsill, a glowing school sign behind.", [("imagine", "Pip and the Helper School.")]),
        ("calm", "Pip in a cozy nest of books, reading a tiny glowing newspaper.", [("imagine", "Pip is a little robot owl."), ("imagine", "Pip reads the news at night.")]),
        ("curious", "Pip's newspaper shows two buildings shaking hands.", [("true", "A school and a company made a plan."), ("true", "They help new workers learn to use AI tools.")]),
        ("curious", "Pip flies over a big office with friendly desks.", [("true", "New workers learn from older workers."), ("imagine", "Pip peeks in the window.")]),
        ("quiet", "Pip holds a strange new tool and looks puzzled.", [("true", "One new worker did not learn much about AI tools in school."), ("imagine", "Pip feels lost with new tools too.")]),
        ("warm", "A kind grown-up waves at Pip from a desk.", [("true", "A leader said new workers are still needed.")]),
        ("excited", "Pip claps her wings in a classroom full of smiles.", [("true", "Now they take classes and get a helper."), ("imagine", "Pip claps her wings.")]),
        ("calm", "Pip settles into her nest under the stars.", [("imagine", "Learning is for everyone."), ("maybe", "Maybe you will learn AI tools one day too.")]),
        ("calm", "A simple page with two real facts and a little source tag.", [
            ("true", "Carnegie Mellon and Microsoft made a program.", "Carnegie Mellon and Microsoft launched the Preceptorship"),
            ("true", "New workers get help from senior engineers.", "plus hands-on mentorship from senior engineers at Microsoft")]),
        QUIZ], PRAISE_CARD, PRAISE_FACTS),

    build("praise", "8to10", "Pip and the Helper School", "green", ["curiosity", "teamwork"], PRAISE_LINK, [
        ("warm", "Pip the robot owl on a moonlit windowsill, a glowing school sign behind.", [("imagine", "Pip and the Helper School.")]),
        ("calm", "Pip in a cozy nest of books, reading a tiny glowing newspaper.", [("imagine", "Pip is a small robot owl who reads the news every night."), ("imagine", "Tonight, one story makes her feathers fluff up with interest.")]),
        ("curious", "Pip's newspaper shows a university and a tech company shaking hands.", [("true", "Carnegie Mellon and Microsoft started a program called PRAISE."), ("true", "It helps new software engineers learn to use AI tools well."), ("imagine", "Software engineers are people who write the code that makes apps work.")]),
        ("curious", "Pip flies over an office where a senior engineer helps a new one.", [("true", "The new engineers take online classes."), ("true", "They also get coaching from senior engineers, who have done the job for years.")]),
        ("quiet", "Pip holds a strange new tool and looks puzzled.", [("true", "One engineer, Jace Watson, said his college did not teach much about AI tools."), ("true", "A leader noticed that AI helps experienced engineers more than new ones."), ("maybe", "Maybe new tools feel tricky when nobody shows you how.")]),
        ("warm", "A kind grown-up at a whiteboard, with Pip listening.", [("true", "Mark Russinovich, a Microsoft leader, said AI does not remove the need for new engineers."), ("imagine", "Pip likes that idea, because everyone has to start somewhere.")]),
        ("excited", "Pip claps her wings in a classroom full of smiles.", [("true", "Now the engineers learn in class and practice with a coach."), ("true", "Their classes can even count toward a master's degree.")]),
        ("calm", "Pip settles into her nest under the stars.", [("imagine", "Pip thinks that smart tools work best with people who keep learning."), ("maybe", "Maybe one day you will learn with an AI tool and a great teacher.")]),
        ("calm", "A simple page with real facts and source tags.", [
            ("true", "Carnegie Mellon and Microsoft launched PRAISE.", "Carnegie Mellon and Microsoft launched the Preceptorship"),
            ("true", "New engineers get coaching from senior engineers at Microsoft.", "plus hands-on mentorship from senior engineers at Microsoft"),
            ("true", "The idea started with a visit to CMU in October 2025.", "The idea came from an October 2025 visit to CMU")]),
        QUIZ], PRAISE_CARD, PRAISE_FACTS),

    build("duet", "5to7", "Pip and the Polite Helper", "green", ["kindness", "curiosity"], DUET_LINK, [
        ("warm", "Pip sitting next to a small glowing helper robot with a question mark bubble.", [("imagine", "Pip and the Polite Helper.")]),
        ("calm", "Pip in her nest reading a glowing newspaper.", [("imagine", "Pip is a little robot owl."), ("imagine", "Pip reads the news at night.")]),
        ("curious", "The newspaper shows a friendly helper robot.", [("true", "A company made a new AI helper."), ("true", "It is called Claude Duet.")]),
        ("curious", "The helper robot holds a tiny to-do list.", [("true", "Each day, it makes a list of things to do.")]),
        ("quiet", "Pip frowns at a mixed-up list.", [("maybe", "What if a helper does the wrong thing?")]),
        ("warm", "The helper robot raises its hand politely.", [("true", "This helper asks you first, before it acts.")]),
        ("excited", "A treasure chest stays locked while the helper smiles.", [("true", "It does not see your secret passwords."), ("imagine", "Pip nods happily.")]),
        ("calm", "Pip and the helper wave goodnight.", [("imagine", "Good helpers ask first."), ("maybe", "Maybe you can ask first too.")]),
        ("calm", "A simple page with two real facts and a little source tag.", [
            ("true", "Anthropic made Claude Duet.", "Anthropic has launched Claude Duet"),
            ("true", "It checks with you before it acts.", "checks with you before it acts on your behalf")]),
        QUIZ], DUET_CARD, DUET_FACTS),

    build("duet", "8to10", "Pip and the Polite Helper", "green", ["kindness", "curiosity"], DUET_LINK, [
        ("warm", "Pip sitting next to a small glowing helper robot with a question mark bubble.", [("imagine", "Pip and the Polite Helper.")]),
        ("calm", "Pip in her nest reading a glowing newspaper.", [("imagine", "Pip is a small robot owl who reads the news every night."), ("imagine", "Tonight's story is about a helper with very good manners.")]),
        ("curious", "The newspaper shows a phone with a friendly helper on screen.", [("true", "A company called Anthropic made a new AI agent named Claude Duet."), ("imagine", "An AI agent is an AI that can do jobs for you, not just answer questions.")]),
        ("curious", "The helper sorts calendar pages and little charts.", [("true", "Each day, Duet makes a list of things that need to get done."), ("true", "It can plan meetings and even build simple apps."), ("true", "It only messages you when something needs your attention.")]),
        ("quiet", "Pip frowns at a helper about to press a big red button.", [("maybe", "But what if a helper does something you did not want?"), ("imagine", "Pip worries about that.")]),
        ("warm", "The helper robot raises its hand politely before touching anything.", [("true", "Anthropic says Duet checks with you before it acts for you."), ("imagine", "That is like a friend asking, \"Can I borrow this?\"")]),
        ("excited", "A treasure chest stays locked while the helper smiles.", [("true", "Duet never directly sees your passwords."), ("true", "It shares health or money information only if you clearly ask it to.")]),
        ("calm", "Pip and the helper wave goodnight.", [("imagine", "Pip thinks the best helpers are the ones who ask first."), ("maybe", "Maybe asking first is a good rule for people, too.")]),
        ("calm", "A simple page with real facts and source tags.", [
            ("true", "Anthropic launched Claude Duet.", "Anthropic has launched Claude Duet"),
            ("true", "It checks with you before it acts.", "checks with you before it acts on your behalf"),
            ("true", "It never directly sees passwords.", "Duet never directly sees passwords")]),
        QUIZ], DUET_CARD, DUET_FACTS),

    build("storm", "5to7", "Pip and the Locked Doors", "yellow", ["courage", "teamwork"], STORM_LINK, [
        ("warm", "Pip standing guard by a row of little lit-up houses.", [("imagine", "Pip and the Locked Doors.")]),
        ("calm", "Pip in her nest reading a glowing newspaper.", [("imagine", "Pip is a little robot owl."), ("imagine", "Pip reads the news at night.")]),
        ("curious", "The newspaper shows sneaky raccoons near a computer.", [("true", "Some hackers used an AI helper to break in.")]),
        ("curious", "Many doors in a row, each with a lock.", [("true", "Their AI tried to guess passwords very fast.")]),
        ("quiet", "One door is open a crack.", [("true", "It got into a company that keeps copies of files.")]),
        ("warm", "A big friendly lighthouse beam shines on the doors.", [("true", "Microsoft spotted the attack and told everyone.")]),
        ("calm", "Shops close their shutters for the night.", [("true", "The company turned off its service to stay safe."), ("imagine", "Pip locks her little door tight.")]),
        ("calm", "Pip tucks a tiny key under her wing.", [("imagine", "Keep your passwords secret, like a treasure.")]),
        ("calm", "A simple page with two real facts and a little source tag.", [
            ("true", "Microsoft shared this news in October.", "Microsoft disclosed on October 21, 2026"),
            ("true", "Microsoft saw many tries to log in.", "Microsoft recorded over 151,000 failed logons")]),
        QUIZ], STORM_CARD, STORM_FACTS),

    build("storm", "8to10", "Pip and the Locked Doors", "yellow", ["courage", "teamwork"], STORM_LINK, [
        ("warm", "Pip standing guard by a row of little lit-up houses.", [("imagine", "Pip and the Locked Doors.")]),
        ("calm", "Pip in her nest reading a glowing newspaper.", [("imagine", "Pip is a small robot owl who reads the news every night."), ("imagine", "Tonight's story is about locks, keys, and some very busy helpers.")]),
        ("curious", "The newspaper shows sneaky raccoons near a glowing computer.", [("true", "Microsoft said a hacker group called Storm-0940 used an AI agent in an attack."), ("imagine", "A hacker is someone who breaks into computers they are not allowed to use.")]),
        ("curious", "Hundreds of doors in a long row, each with a lock.", [("true", "The AI tried to guess passwords at many organizations."), ("true", "On one day, it tried up to 2,900 times in a single minute.")]),
        ("quiet", "One door is open a crack.", [("true", "The hackers got into ConnectWise Cloud Backup, a service that keeps copies of files."), ("true", "From there, they could reach some of its customers.")]),
        ("warm", "A big friendly lighthouse beam shines on the doors.", [("true", "Microsoft found out what happened and shared the news on October 21, 2026."), ("imagine", "Sharing it helps other companies check their own locks.")]),
        ("calm", "Shops close their shutters while workers fix the locks.", [("true", "ConnectWise turned off some services for a while to keep people safe."), ("true", "It is turning them back on step by step.")]),
        ("calm", "Pip tucks a tiny key under her wing.", [("imagine", "Pip thinks AI is a tool, and people choose how to use it."), ("imagine", "Strong, secret passwords help keep the doors locked.")]),
        ("calm", "A simple page with real facts and source tags.", [
            ("true", "Microsoft shared the news on October 21, 2026.", "Microsoft disclosed on October 21, 2026"),
            ("true", "There were more than 151,000 failed tries to log in.", "Microsoft recorded over 151,000 failed logons"),
            ("true", "ConnectWise shut down services for a while.", "ConnectWise temporarily shut down services")]),
        QUIZ], STORM_CARD, STORM_FACTS),
]

if __name__ == "__main__":
    for doc in STORIES:
        path = os.path.join(HERE, "outputs", f"{doc['story_id']}_{doc['age_level']}.json")
        json.dump(doc, open(path, "w"), indent=2)
    print("wrote", len(STORIES), "files")
