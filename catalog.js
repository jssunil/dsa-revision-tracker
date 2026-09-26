/* DSA Revision Tracker — problem catalog (reference data).
 * This is static reference material: the 60-day plan, 41 patterns, and the
 * LeetCode Top Interview 150 mapped onto pattern days.
 * Your mutable state (status / notes / links / images) lives in data/progress.json,
 * which is the source of truth committed back to this repo.
 * Edit this file and push to change the plan itself. */
window.DSA_CATALOG = {
  meta: {
    title: "DSA Revision Tracker",
    subtitle: "60-day sprint · 41 patterns · LeetCode Top Interview 150",
    totalDays: 60,
    totalPatterns: 41,
    totalProblems: 150
  },
  // difficulty: E = Easy, M = Medium, H = Hard
  days: [
    { d:1, phase:"Foundations I — Arrays, Pointers, Windows, Search", phaseIdx:1, tag:"new", pattern:"Two Pointers (Converging)",
      focus:"Opposite ends walk inward over sorted input.",
      problems:[
        {slug:"two-sum-ii-input-array-is-sorted", title:"Two Sum II", diff:"M"},
        {slug:"container-with-most-water", title:"Container With Most Water", diff:"M"},
        {slug:"3sum", title:"3Sum", diff:"M"},
        {slug:"valid-palindrome", title:"Valid Palindrome", diff:"E"},
        {slug:"is-subsequence", title:"Is Subsequence", diff:"E"},
        {slug:"merge-sorted-array", title:"Merge Sorted Array", diff:"E"},
        {slug:"remove-duplicates-from-sorted-array-ii", title:"Remove Duplicates from Sorted Array II", diff:"M"}
      ]},
    { d:2, phase:"Foundations I — Arrays, Pointers, Windows, Search", phaseIdx:1, tag:"new", pattern:"Fast & Slow Pointers (Floyd's)",
      focus:"Cycle detection, gap technique, middle node.",
      problems:[
        {slug:"linked-list-cycle", title:"Linked List Cycle", diff:"E"},
        {slug:"happy-number", title:"Happy Number", diff:"E"},
        {slug:"remove-nth-node-from-end-of-list", title:"Remove Nth Node From End", diff:"M"},
        {slug:"add-two-numbers", title:"Add Two Numbers", diff:"M"},
        {slug:"copy-list-with-random-pointer", title:"Copy List with Random Pointer", diff:"M"}
      ]},
    { d:3, phase:"Foundations I — Arrays, Pointers, Windows, Search", phaseIdx:1, tag:"new", pattern:"Sliding Window (Fixed)",
      focus:"Constant-width window, O(1) in/out update.",
      note:"Fixed-window is thin in Top 150 — add a couple from NeetCode.",
      problems:[
        {slug:"substring-with-concatenation-of-all-words", title:"Substring with Concatenation of All Words", diff:"H"}
      ]},
    { d:4, phase:"Foundations I — Arrays, Pointers, Windows, Search", phaseIdx:1, tag:"new", pattern:"Sliding Window (Dynamic)",
      focus:"Grow right, shrink left to keep an invariant.",
      problems:[
        {slug:"longest-substring-without-repeating-characters", title:"Longest Substring Without Repeating Characters", diff:"M"},
        {slug:"minimum-size-subarray-sum", title:"Minimum Size Subarray Sum", diff:"M"},
        {slug:"minimum-window-substring", title:"Minimum Window Substring", diff:"H"},
        {slug:"contains-duplicate-ii", title:"Contains Duplicate II", diff:"E"}
      ]},
    { d:5, phase:"Foundations I — Arrays, Pointers, Windows, Search", phaseIdx:1, tag:"new", pattern:"Prefix Sums",
      focus:"Cumulative totals; hashmap-of-prefixes trick.",
      note:"Pure prefix-sum problems are scarce in Top 150; the technique recurs inside later problems.",
      problems:[
        {slug:"product-of-array-except-self", title:"Product of Array Except Self", diff:"M"}
      ]},
    { d:6, phase:"Foundations I — Arrays, Pointers, Windows, Search", phaseIdx:1, tag:"new", pattern:"Monotonic Stack",
      focus:"Next greater/smaller in one pass; stack-of-indices.",
      problems:[
        {slug:"valid-parentheses", title:"Valid Parentheses", diff:"E"},
        {slug:"min-stack", title:"Min Stack", diff:"M"},
        {slug:"evaluate-reverse-polish-notation", title:"Evaluate Reverse Polish Notation", diff:"M"},
        {slug:"simplify-path", title:"Simplify Path", diff:"M"},
        {slug:"basic-calculator", title:"Basic Calculator", diff:"H"},
        {slug:"trapping-rain-water", title:"Trapping Rain Water", diff:"H"}
      ]},
    { d:7, phase:"Foundations I — Arrays, Pointers, Windows, Search", phaseIdx:1, tag:"rev", pattern:"Revision — Week 1",
      focus:"Recall all 6 templates cold. Timed 2-problem set (45 min).", problems:[] },
    { d:8, phase:"Foundations I — Arrays, Pointers, Windows, Search", phaseIdx:1, tag:"new", pattern:"Monotonic Deque",
      focus:"Window extreme at the front of a decreasing deque.",
      note:"Not in Top 150 — do Sliding Window Maximum + Shortest Subarray with Sum ≥ K from NeetCode.",
      problems:[] },
    { d:9, phase:"Foundations I — Arrays, Pointers, Windows, Search", phaseIdx:1, tag:"new", pattern:"Binary Search (Bisection)",
      focus:"Halve a sorted range; get the lo/hi invariant right once.",
      problems:[
        {slug:"search-insert-position", title:"Search Insert Position", diff:"E"},
        {slug:"search-a-2d-matrix", title:"Search a 2D Matrix", diff:"M"},
        {slug:"find-peak-element", title:"Find Peak Element", diff:"M"},
        {slug:"search-in-rotated-sorted-array", title:"Search in Rotated Sorted Array", diff:"M"},
        {slug:"find-first-and-last-position-of-element-in-sorted-array", title:"Find First and Last Position", diff:"M"},
        {slug:"find-minimum-in-rotated-sorted-array", title:"Find Minimum in Rotated Sorted Array", diff:"M"}
      ]},
    { d:10, phase:"Foundations I — Arrays, Pointers, Windows, Search", phaseIdx:1, tag:"new", pattern:"Binary Search on Answer Space",
      focus:"Binary-search the value via a monotone feasibility test.",
      problems:[
        {slug:"sqrtx", title:"Sqrt(x)", diff:"E"},
        {slug:"median-of-two-sorted-arrays", title:"Median of Two Sorted Arrays", diff:"H"}
      ]},
    { d:11, phase:"Foundations I — Arrays, Pointers, Windows, Search", phaseIdx:1, tag:"new", pattern:"Min/Max Heap (Top-K)",
      focus:"Size-K heap over a stream; evict the weakest.",
      problems:[
        {slug:"kth-largest-element-in-an-array", title:"Kth Largest Element in an Array", diff:"M"},
        {slug:"ipo", title:"IPO", diff:"H"},
        {slug:"find-k-pairs-with-smallest-sums", title:"Find K Pairs with Smallest Sums", diff:"M"}
      ]},
    { d:12, phase:"Foundations I — Arrays, Pointers, Windows, Search", phaseIdx:1, tag:"new", pattern:"Two Heaps",
      focus:"Balanced max-heap + min-heap expose the median.",
      problems:[
        {slug:"find-median-from-data-stream", title:"Find Median from Data Stream", diff:"H"}
      ]},
    { d:13, phase:"Foundations I — Arrays, Pointers, Windows, Search", phaseIdx:1, tag:"new", pattern:"K-Way Merge",
      focus:"Heap of stream fronts emits the global minimum.",
      problems:[
        {slug:"merge-two-sorted-lists", title:"Merge Two Sorted Lists", diff:"E"},
        {slug:"merge-k-sorted-lists", title:"Merge k Sorted Lists", diff:"H"}
      ]},
    { d:14, phase:"Foundations I — Arrays, Pointers, Windows, Search", phaseIdx:1, tag:"rev", pattern:"Revision — Weeks 1–2",
      focus:"Mixed recall (12 patterns). One timed 2-problem mock, talk aloud.", problems:[] },

    { d:15, phase:"Foundations II — Graphs, Trees, Structures", phaseIdx:2, tag:"new", pattern:"Interval Sweep-Line",
      focus:"Sort by boundary; sweep, tracking overlaps.",
      problems:[
        {slug:"summary-ranges", title:"Summary Ranges", diff:"E"},
        {slug:"merge-intervals", title:"Merge Intervals", diff:"M"},
        {slug:"insert-interval", title:"Insert Interval", diff:"M"},
        {slug:"minimum-number-of-arrows-to-burst-balloons", title:"Minimum Arrows to Burst Balloons", diff:"M"}
      ]},
    { d:16, phase:"Foundations II — Graphs, Trees, Structures", phaseIdx:2, tag:"new", pattern:"Matrix / Grid Traversal (BFS/DFS)",
      focus:"Treat the grid/graph as nodes; flood with BFS or DFS.",
      problems:[
        {slug:"number-of-islands", title:"Number of Islands", diff:"M"},
        {slug:"surrounded-regions", title:"Surrounded Regions", diff:"M"},
        {slug:"clone-graph", title:"Clone Graph", diff:"M"},
        {slug:"evaluate-division", title:"Evaluate Division", diff:"M"},
        {slug:"snakes-and-ladders", title:"Snakes and Ladders", diff:"M"},
        {slug:"minimum-genetic-mutation", title:"Minimum Genetic Mutation", diff:"M"},
        {slug:"word-ladder", title:"Word Ladder", diff:"H"}
      ]},
    { d:17, phase:"Foundations II — Graphs, Trees, Structures", phaseIdx:2, tag:"new", pattern:"Topological Sort (Kahn's)",
      focus:"Emit zero-in-degree nodes; detect the cycle case.",
      problems:[
        {slug:"course-schedule", title:"Course Schedule", diff:"M"},
        {slug:"course-schedule-ii", title:"Course Schedule II", diff:"M"}
      ]},
    { d:18, phase:"Foundations II — Graphs, Trees, Structures", phaseIdx:2, tag:"new", pattern:"Union-Find (DSU)",
      focus:"Path compression + union by rank; near-O(1) connectivity.",
      note:"DSU is thin in Top 150 — add Redundant Connection + Number of Provinces.",
      problems:[
        {slug:"longest-consecutive-sequence", title:"Longest Consecutive Sequence", diff:"M"}
      ]},
    { d:19, phase:"Foundations II — Graphs, Trees, Structures", phaseIdx:2, tag:"new", pattern:"Trie (Prefix Tree)",
      focus:"Character-keyed tree; O(L) prefix lookup.",
      problems:[
        {slug:"implement-trie-prefix-tree", title:"Implement Trie", diff:"M"},
        {slug:"design-add-and-search-words-data-structure", title:"Add and Search Word", diff:"M"},
        {slug:"word-search-ii", title:"Word Search II", diff:"H"},
        {slug:"longest-common-prefix", title:"Longest Common Prefix", diff:"E"}
      ]},
    { d:20, phase:"Foundations II — Graphs, Trees, Structures", phaseIdx:2, tag:"new", pattern:"Backtracking with Pruning",
      focus:"DFS build; abandon a branch on constraint violation.",
      problems:[
        {slug:"letter-combinations-of-a-phone-number", title:"Letter Combinations of a Phone Number", diff:"M"},
        {slug:"combinations", title:"Combinations", diff:"M"},
        {slug:"permutations", title:"Permutations", diff:"M"},
        {slug:"combination-sum", title:"Combination Sum", diff:"M"},
        {slug:"n-queens-ii", title:"N-Queens II", diff:"H"},
        {slug:"generate-parentheses", title:"Generate Parentheses", diff:"M"},
        {slug:"word-search", title:"Word Search", diff:"M"}
      ]},
    { d:21, phase:"Foundations II — Graphs, Trees, Structures", phaseIdx:2, tag:"rev", pattern:"Revision — Week 3 (tree hard set)",
      focus:"Graph + backtracking recall; then the tree D&C hards.",
      problems:[
        {slug:"binary-tree-maximum-path-sum", title:"Binary Tree Maximum Path Sum", diff:"H"},
        {slug:"lowest-common-ancestor-of-a-binary-tree", title:"Lowest Common Ancestor", diff:"M"},
        {slug:"construct-binary-tree-from-preorder-and-inorder-traversal", title:"Construct BT from Preorder & Inorder", diff:"M"},
        {slug:"construct-binary-tree-from-inorder-and-postorder-traversal", title:"Construct BT from Inorder & Postorder", diff:"M"}
      ]},

    { d:22, phase:"Dynamic Programming", phaseIdx:3, tag:"new", pattern:"1-D Dynamic Programming",
      focus:"Rolling variables; Kadane family.",
      problems:[
        {slug:"climbing-stairs", title:"Climbing Stairs", diff:"E"},
        {slug:"house-robber", title:"House Robber", diff:"M"},
        {slug:"maximum-subarray", title:"Maximum Subarray", diff:"M"},
        {slug:"maximum-sum-circular-subarray", title:"Maximum Sum Circular Subarray", diff:"M"},
        {slug:"best-time-to-buy-and-sell-stock", title:"Best Time to Buy and Sell Stock", diff:"E"},
        {slug:"longest-increasing-subsequence", title:"Longest Increasing Subsequence", diff:"M"}
      ]},
    { d:23, phase:"Dynamic Programming", phaseIdx:3, tag:"new", pattern:"2-D Dynamic Programming",
      focus:"Grid/table tabulation.",
      problems:[
        {slug:"triangle", title:"Triangle", diff:"M"},
        {slug:"minimum-path-sum", title:"Minimum Path Sum", diff:"M"},
        {slug:"unique-paths-ii", title:"Unique Paths II", diff:"M"},
        {slug:"maximal-square", title:"Maximal Square", diff:"M"}
      ]},
    { d:24, phase:"Dynamic Programming", phaseIdx:3, tag:"new", pattern:"0/1 Knapsack & Bounded State",
      focus:"Subset selection under capacity; coin/word variants.",
      problems:[
        {slug:"coin-change", title:"Coin Change", diff:"M"},
        {slug:"word-break", title:"Word Break", diff:"M"}
      ]},
    { d:25, phase:"Dynamic Programming", phaseIdx:3, tag:"new", pattern:"LCS / Edit Distance",
      focus:"Two-string alignment; match vs transform.",
      problems:[
        {slug:"edit-distance", title:"Edit Distance", diff:"M"},
        {slug:"longest-palindromic-substring", title:"Longest Palindromic Substring", diff:"M"},
        {slug:"interleaving-string", title:"Interleaving String", diff:"M"}
      ]},
    { d:26, phase:"Dynamic Programming", phaseIdx:3, tag:"new", pattern:"State Machine DP",
      focus:"Named states + transitions; the stock-trading family.",
      problems:[
        {slug:"best-time-to-buy-and-sell-stock-iii", title:"Best Time to Buy and Sell Stock III", diff:"H"},
        {slug:"best-time-to-buy-and-sell-stock-iv", title:"Best Time to Buy and Sell Stock IV", diff:"H"}
      ]},
    { d:27, phase:"Dynamic Programming", phaseIdx:3, tag:"rev", pattern:"Consolidation — DP only",
      focus:"Re-solve 4 mixed DP problems from Days 22–26, notes closed. DP is where most seniors leak points.", problems:[] },
    { d:28, phase:"Dynamic Programming", phaseIdx:3, tag:"rev", pattern:"Revision — Weeks 3–4 (D&C + BST)",
      focus:"One full narrated 45-min problem, then clear the D&C / BST set.",
      problems:[
        {slug:"convert-sorted-array-to-binary-search-tree", title:"Convert Sorted Array to BST", diff:"E"},
        {slug:"sort-list", title:"Sort List", diff:"M"},
        {slug:"construct-quad-tree", title:"Construct Quad Tree", diff:"M"},
        {slug:"powx-n", title:"Pow(x, n)", diff:"M"},
        {slug:"validate-binary-search-tree", title:"Validate Binary Search Tree", diff:"M"},
        {slug:"kth-smallest-element-in-a-bst", title:"Kth Smallest Element in a BST", diff:"M"},
        {slug:"minimum-absolute-difference-in-bst", title:"Minimum Absolute Difference in BST", diff:"E"},
        {slug:"binary-search-tree-iterator", title:"Binary Search Tree Iterator", diff:"M"}
      ]},

    { d:29, phase:"Foundations III — Remaining + Capstone", phaseIdx:4, tag:"new", pattern:"Greedy Exchange Arguments",
      focus:"Locally optimal, justified by an exchange argument.",
      problems:[
        {slug:"best-time-to-buy-and-sell-stock-ii", title:"Best Time to Buy and Sell Stock II", diff:"M"},
        {slug:"jump-game", title:"Jump Game", diff:"M"},
        {slug:"jump-game-ii", title:"Jump Game II", diff:"M"},
        {slug:"gas-station", title:"Gas Station", diff:"M"},
        {slug:"candy", title:"Candy", diff:"H"},
        {slug:"h-index", title:"H-Index", diff:"M"}
      ]},
    { d:30, phase:"Foundations III — Remaining + Capstone", phaseIdx:4, tag:"new", pattern:"Bit Manipulation & Bitmasks",
      focus:"XOR cancellation, masks, bit tricks.",
      problems:[
        {slug:"single-number", title:"Single Number", diff:"E"},
        {slug:"single-number-ii", title:"Single Number II", diff:"M"},
        {slug:"number-of-1-bits", title:"Number of 1 Bits", diff:"E"},
        {slug:"reverse-bits", title:"Reverse Bits", diff:"E"},
        {slug:"add-binary", title:"Add Binary", diff:"E"},
        {slug:"bitwise-and-of-numbers-range", title:"Bitwise AND of Numbers Range", diff:"M"},
        {slug:"majority-element", title:"Majority Element", diff:"E"}
      ]},
    { d:31, phase:"Foundations III — Remaining + Capstone", phaseIdx:4, tag:"new", pattern:"Cyclic Sort + In-place Matrix",
      focus:"Index-placement in-place; same idea powers matrix mechanics.",
      note:"Cyclic Sort proper (Missing Number, First Missing Positive) isn't in Top 150 — add those two.",
      problems:[
        {slug:"set-matrix-zeroes", title:"Set Matrix Zeroes", diff:"M"},
        {slug:"spiral-matrix", title:"Spiral Matrix", diff:"M"},
        {slug:"rotate-image", title:"Rotate Image", diff:"M"},
        {slug:"game-of-life", title:"Game of Life", diff:"M"},
        {slug:"valid-sudoku", title:"Valid Sudoku", diff:"M"}
      ]},
    { d:32, phase:"Foundations III — Remaining + Capstone", phaseIdx:4, tag:"new", pattern:"Linked List Inversion",
      focus:"Re-thread pointers in one pass with a sentinel.",
      problems:[
        {slug:"reverse-linked-list-ii", title:"Reverse Linked List II", diff:"M"},
        {slug:"reverse-nodes-in-k-group", title:"Reverse Nodes in k-Group", diff:"H"},
        {slug:"partition-list", title:"Partition List", diff:"M"},
        {slug:"rotate-list", title:"Rotate List", diff:"M"},
        {slug:"remove-duplicates-from-sorted-list-ii", title:"Remove Duplicates from Sorted List II", diff:"M"}
      ]},
    { d:33, phase:"Foundations III — Remaining + Capstone", phaseIdx:4, tag:"new", pattern:"Binary Tree Divide & Conquer",
      focus:"Recurse, combine child summaries, update a global.",
      problems:[
        {slug:"maximum-depth-of-binary-tree", title:"Maximum Depth of Binary Tree", diff:"E"},
        {slug:"invert-binary-tree", title:"Invert Binary Tree", diff:"E"},
        {slug:"symmetric-tree", title:"Symmetric Tree", diff:"E"},
        {slug:"same-tree", title:"Same Tree", diff:"E"},
        {slug:"path-sum", title:"Path Sum", diff:"E"},
        {slug:"sum-root-to-leaf-numbers", title:"Sum Root to Leaf Numbers", diff:"M"},
        {slug:"count-complete-tree-nodes", title:"Count Complete Tree Nodes", diff:"E"},
        {slug:"flatten-binary-tree-to-linked-list", title:"Flatten Binary Tree to Linked List", diff:"M"}
      ]},
    { d:34, phase:"Foundations III — Remaining + Capstone", phaseIdx:4, tag:"new", pattern:"Tree BFS + Dijkstra's",
      focus:"Level-order queue walks; Dijkstra is the weighted cousin.",
      note:"Dijkstra isn't in Top 150 — do Network Delay Time + Path with Maximum Probability.",
      problems:[
        {slug:"binary-tree-level-order-traversal", title:"Binary Tree Level Order Traversal", diff:"M"},
        {slug:"binary-tree-zigzag-level-order-traversal", title:"Binary Tree Zigzag Level Order Traversal", diff:"M"},
        {slug:"binary-tree-right-side-view", title:"Binary Tree Right Side View", diff:"M"},
        {slug:"average-of-levels-in-binary-tree", title:"Average of Levels in Binary Tree", diff:"E"},
        {slug:"populating-next-right-pointers-in-each-node-ii", title:"Populating Next Right Pointers II", diff:"M"}
      ]},
    { d:35, phase:"Foundations III — Remaining + Capstone", phaseIdx:4, tag:"cap", pattern:"Foundational Capstone",
      focus:"90-min mixed mock (2 problems). Review all 30 trigger notes. Foundations done.", problems:[] },

    { d:36, phase:"Advanced Systems Patterns", phaseIdx:5, tag:"new", pattern:"Segment Tree with Lazy Propagation",
      focus:"Range query + range update; write the template twice.",
      note:"Beyond Top 150 — Atlas template + Range Sum Query Mutable, then a lazy-prop range-add problem.", problems:[] },
    { d:37, phase:"Advanced Systems Patterns", phaseIdx:5, tag:"new", pattern:"Bitwise XOR Trie",
      focus:"Numbers as bit paths; greedy opposite-bit walk.",
      note:"Beyond Top 150 — do Maximum XOR of Two Numbers in an Array.", problems:[] },
    { d:38, phase:"Advanced Systems Patterns", phaseIdx:5, tag:"new", pattern:"Bellman-Ford & Bounded Hops",
      focus:"Relax edges K+1 times over a snapshot.",
      note:"Beyond Top 150 — do Cheapest Flights Within K Stops.", problems:[] },
    { d:39, phase:"Advanced Systems Patterns", phaseIdx:5, tag:"new", pattern:"Tarjan's SCC / Bridges",
      focus:"Discovery time + low-link in one DFS.",
      note:"Beyond Top 150 — do Critical Connections in a Network.", problems:[] },
    { d:40, phase:"Advanced Systems Patterns", phaseIdx:5, tag:"new", pattern:"Thread-Safe LRU / LFU Cache",
      focus:"Hash map + doubly-linked list; add and reason about the lock.",
      problems:[
        {slug:"lru-cache", title:"LRU Cache", diff:"M"},
        {slug:"insert-delete-getrandom-o1", title:"Insert Delete GetRandom O(1)", diff:"M"}
      ]},
    { d:41, phase:"Advanced Systems Patterns", phaseIdx:5, tag:"new", pattern:"Token Bucket / Leaky Bucket",
      focus:"Timestamp math; burst behaviour under a QPS cap.",
      note:"Beyond Top 150 — Design Hit Counter / Logger Rate Limiter, then reason about concurrency.", problems:[] },
    { d:42, phase:"Advanced Systems Patterns", phaseIdx:5, tag:"rev", pattern:"Revision — Advanced hardest",
      focus:"Re-implement Segment Tree + Tarjan from scratch, no notes.", problems:[] },

    { d:43, phase:"AI-Infrastructure Patterns", phaseIdx:6, tag:"new", pattern:"Count-Min Sketch",
      focus:"Hash rows; min across rows estimates frequency.",
      note:"Not a LeetCode problem — implement from the Atlas; test on a token stream.", problems:[] },
    { d:44, phase:"AI-Infrastructure Patterns", phaseIdx:6, tag:"new", pattern:"HyperLogLog Cardinality",
      focus:"Registers of leading-zero runs; harmonic mean.",
      note:"Not a LeetCode problem — implement and validate against an exact set count.", problems:[] },
    { d:45, phase:"AI-Infrastructure Patterns", phaseIdx:6, tag:"new", pattern:"HNSW Vector Graph Indexing",
      focus:"Layered greedy descent + base-layer beam search.",
      note:"Not a LeetCode problem — study the paper/diagram; sketch build + search.", problems:[] },
    { d:46, phase:"AI-Infrastructure Patterns", phaseIdx:6, tag:"new", pattern:"Speculative Decoding Verification",
      focus:"Draft proposes, target verifies; accept a matching prefix.",
      note:"Not a LeetCode problem — understand why accept/reject preserves the target distribution.", problems:[] },
    { d:47, phase:"AI-Infrastructure Patterns", phaseIdx:6, tag:"new", pattern:"Continuous Batching Scheduler",
      focus:"Admit/evict sequences under a KV-cache budget. All 41 done.",
      note:"Not a LeetCode problem — sketch the vLLM-style scheduler loop.", problems:[] },
    { d:48, phase:"AI-Infrastructure Patterns", phaseIdx:6, tag:"rev", pattern:"Consolidation — AI-infra",
      focus:"Whiteboard-explain each of the 5 aloud as a design-round drill.", problems:[] },
    { d:49, phase:"AI-Infrastructure Patterns", phaseIdx:6, tag:"rev", pattern:"Revision — all 11 advanced",
      focus:"Recall every advanced trigger note; re-solve your 3 weakest.", problems:[] },

    { d:50, phase:"Interview Simulation", phaseIdx:7, tag:"mock", pattern:"Recognition set",
      focus:"3 mediums, ~28 min each. Name the pattern before writing any code.", problems:[] },
    { d:51, phase:"Interview Simulation", phaseIdx:7, tag:"mock", pattern:"Timed mock",
      focus:"2 problems × 45 min + honest self-review against a rubric.", problems:[] },
    { d:52, phase:"Interview Simulation", phaseIdx:7, tag:"mock", pattern:"Graph + DP focus mock",
      focus:"The two areas that most often decide a senior verdict.", problems:[] },
    { d:53, phase:"Interview Simulation", phaseIdx:7, tag:"mock", pattern:"Systems live-coding mock",
      focus:"LRU cache, rate limiter, or segment tree — coded live, explained.", problems:[] },
    { d:54, phase:"Interview Simulation", phaseIdx:7, tag:"mock", pattern:"Full loop simulation",
      focus:"Two back-to-back 45-min rounds. Record yourself; watch it back.", problems:[] },
    { d:55, phase:"Interview Simulation", phaseIdx:7, tag:"mock", pattern:"Weak-area repair",
      focus:"Re-drill whatever you fumbled on Days 50–54. Targeted, not broad.", problems:[] },
    { d:56, phase:"Interview Simulation", phaseIdx:7, tag:"mock", pattern:"Full loop simulation — round 2",
      focus:"Same format. Compare against Day 54; the delta is your progress.", problems:[] },

    { d:57, phase:"Buffer & Final Polish", phaseIdx:8, tag:"buf", pattern:"Hardest problems re-solve",
      focus:"Your personal hardest list, from scratch — includes the two Top-150 brutes.",
      problems:[
        {slug:"text-justification", title:"Text Justification", diff:"H"},
        {slug:"max-points-on-a-line", title:"Max Points on a Line", diff:"H"}
      ]},
    { d:58, phase:"Buffer & Final Polish", phaseIdx:8, tag:"buf", pattern:"Speed round — Top-150 fundamentals sweep",
      focus:"8–10 × 15 min. Clears remaining string / hashmap / math basics under a clock.",
      problems:[
        {slug:"remove-element", title:"Remove Element", diff:"E"},
        {slug:"remove-duplicates-from-sorted-array", title:"Remove Duplicates from Sorted Array", diff:"E"},
        {slug:"rotate-array", title:"Rotate Array", diff:"M"},
        {slug:"two-sum", title:"Two Sum", diff:"E"},
        {slug:"valid-anagram", title:"Valid Anagram", diff:"E"},
        {slug:"group-anagrams", title:"Group Anagrams", diff:"M"},
        {slug:"ransom-note", title:"Ransom Note", diff:"E"},
        {slug:"isomorphic-strings", title:"Isomorphic Strings", diff:"E"},
        {slug:"word-pattern", title:"Word Pattern", diff:"E"},
        {slug:"roman-to-integer", title:"Roman to Integer", diff:"E"},
        {slug:"integer-to-roman", title:"Integer to Roman", diff:"M"},
        {slug:"length-of-last-word", title:"Length of Last Word", diff:"E"},
        {slug:"reverse-words-in-a-string", title:"Reverse Words in a String", diff:"M"},
        {slug:"zigzag-conversion", title:"Zigzag Conversion", diff:"M"},
        {slug:"find-the-index-of-the-first-occurrence-in-a-string", title:"First Occurrence in a String", diff:"E"},
        {slug:"palindrome-number", title:"Palindrome Number", diff:"E"},
        {slug:"plus-one", title:"Plus One", diff:"E"},
        {slug:"factorial-trailing-zeroes", title:"Factorial Trailing Zeroes", diff:"M"}
      ]},
    { d:59, phase:"Buffer & Final Polish", phaseIdx:8, tag:"buf", pattern:"Light review",
      focus:"One calm pass over all 41 trigger notes. No cramming.", problems:[] },
    { d:60, phase:"Buffer & Final Polish", phaseIdx:8, tag:"buf", pattern:"Final light mock or rest",
      focus:"One easy round to stay warm, or rest. You're interview-ready.", problems:[] }
  ]
};
