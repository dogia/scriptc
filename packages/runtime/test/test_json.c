/* Oracle test for scr_json.c (the dynamic-value dyn, the RFC 8259 parser,
 * the dynCheck failure path, and the stringify output buffer). Run by
 * json.test.ts; built with ASan + the RC audit, so a clean exit also proves
 * the checked-dynamic tree's recursive ownership (parse failures mid-tree included) leaks
 * nothing and frees nothing twice.
 *
 * EXACT ERROR MESSAGES are asserted here, against OUR strings: compiled
 * programs cannot observe them (the supported catch form is bindingless),
 * and the V8-flavored parse messages are documented as approximate
 * (SEMANTICS.md) — so the C tests, not the differential corpus, are where
 * the exact texts are pinned. Each expected failure routes through
 * scr_exc_print_uncaught(), and json.test.ts asserts the stderr lines.
 */
#include "scr_runtime.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int checks = 0;
static int failures = 0;

static void check(bool ok, const char *name) {
  checks++;
  if (!ok) {
    failures++;
    printf("FAIL %s\n", name);
  }
}

static ScrStr *S(const char *s) { return scr_str_new(s, strlen(s)); }

static bool str_is(const ScrStr *s, const char *want) {
  return s && s->len == strlen(want) && memcmp(s->data, want, s->len) == 0;
}

/* Parse `text`, expect success, return the checked-dynamic tree (+1). */
static ScrDyn *parse_ok(const char *text, const char *name) {
  ScrStr *t = S(text);
  ScrDyn *d = scr_json_parse(t);
  scr_str_release(t);
  check(d != NULL && !scr_exc_pending(), name);
  if (scr_exc_pending()) scr_exc_clear();
  return d;
}

/* Parse `text`, expect a throw; the message prints to stderr (asserted by
 * json.test.ts) which also clears the cell. */
static void parse_fail(const char *text, const char *name) {
  ScrStr *t = S(text);
  ScrDyn *d = scr_json_parse(t);
  scr_str_release(t);
  check(d == NULL && scr_exc_pending(), name);
  if (d) scr_dyn_release(d);
  if (scr_exc_pending()) scr_exc_print_uncaught();
}

static bool dyn_str_is(const ScrDyn *d, const char *want) {
  return d && d->kind == SCR_DYN_STR && str_is(d->v.str, want);
}

/* Low-level callback contracts that typed source does not expose: cyclic
 * dyn graphs, receiver lifetime during mutation, and runtime refusal paths.
 * Every temporary remains under the existing ASan and RC audit harness. */
static size_t callback_calls;
static int callback_mode;
static ScrDyn *callback_shared;

static ScrDyn *json_test_callback(ScrClosure *closure, ScrDyn *const *args, size_t argc) {
  (void)closure;
  callback_calls++;
  check(argc == 2, "JSON callback receives key and value");
  check(args[0]->kind == SCR_DYN_STR, "JSON callback key is a string");
  ScrDyn *holder = scr_dyn_this_get();
  check(holder->kind == SCR_DYN_OBJ || holder->kind == SCR_DYN_ARR || holder->kind == SCR_DYN_BYTES, "JSON callback holder bound");
  const ScrStr *key = args[0]->v.str;
  ScrDyn *value = args[1];
  if (callback_mode == 7 && (str_is(key, "0") || str_is(key, "1"))) {
    check(holder == callback_shared, "returned bytes remain the holder for indexed callbacks");
  }
  if (callback_mode == 1 && key->len) {
    scr_dyn_release(holder);
    return scr_dyn_retain(scr_dyn_undefined());
  }
  if (callback_mode == 2 && str_is(key, "a")) {
    /* Reallocating the holder's entries must not invalidate traversal. */
    for (size_t i = 0; i < 80; i++) {
      char name[32];
      int length = snprintf(name, sizeof name, "new%zu", i);
      scr_dyn_obj_set(holder, name, (size_t)length, scr_dyn_new_num((double)i));
    }
    scr_dyn_obj_set(holder, "b", 1, scr_dyn_new_num(9));
  }
  if (callback_mode == 3 && key->len) {
    scr_throw_error_msg(SCR_ERR_TYPE, "callback", 8);
    scr_dyn_release(holder);
    return NULL;
  }
  if (callback_mode == 4 && str_is(key, "a")) {
    /* Release the original parent edge while its value is borrowed by the
     * callback. The walker must still own that original value. */
    scr_dyn_obj_set(holder, "a", 1, scr_dyn_new_null());
    check(value->kind == SCR_DYN_OBJ, "replaced child survives callback");
  }
  if (callback_mode == 5) {
    ScrDyn *replacement = scr_dyn_new_obj();
    scr_dyn_obj_set(replacement, "child", 5, scr_dyn_new_null());
    scr_dyn_release(holder);
    return replacement;
  }
  if ((callback_mode == 6 && key->len) || (callback_mode == 7 && str_is(key, "replace"))) {
    scr_dyn_release(holder);
    return scr_dyn_retain(callback_shared);
  }
  scr_dyn_release(holder);
  return scr_dyn_retain(value);
}

static ScrDyn *json_test_to_json(ScrClosure *closure, ScrDyn *const *args, size_t argc) {
  (void)closure;
  check(argc == 1, "toJSON receives only the property key");
  check(dyn_str_is(args[0], "nested"), "toJSON receives containing key");
  ScrDyn *holder = scr_dyn_this_get();
  check(holder == callback_shared, "toJSON receiver is the value");
  /* Drop the only owning property reference to this callable while it is
   * executing; the invocation must retain its closure independently. */
  scr_dyn_obj_set(holder, "toJSON", 6, scr_dyn_new_null());
  scr_dyn_release(holder);
  return scr_dyn_new_num(42);
}

static ScrDyn *json_test_func(ScrDynThunk thunk) {
  return scr_dyn_new_func(scr_closure_new(NULL, 0), thunk, 2, "JSON test callback", "json_test");
}

static ScrDyn *json_test_stringify(ScrDyn *value, ScrDyn *callback, const char *gap) {
  ScrStr *indent = S(gap);
  ScrDyn *out = scr_json_stringify_replacer(value, callback, indent);
  scr_str_release(indent);
  return out;
}

static ScrDyn *json_test_parse(const char *text, ScrDyn *callback) {
  ScrStr *input = S(text);
  ScrDyn *out = scr_json_parse_reviver(input, callback);
  scr_str_release(input);
  return out;
}

static void json_callback_tests(void) {
  ScrDyn *callback = json_test_func(json_test_callback);
  callback_mode = 0;
  callback_calls = 0;
  ScrDyn *value = parse_ok("{\"10\":10,\"2\":2,\"a\":[1,true,null]}", "callback input");
  ScrDyn *out = json_test_stringify(value, callback, "  ");
  check(dyn_str_is(out, "{\n  \"2\": 2,\n  \"10\": 10,\n  \"a\": [\n    1,\n    true,\n    null\n  ]\n}"), "replacer pretty output");
  check(callback_calls == 7, "replacer invokes once per property plus root");
  scr_dyn_release(out);
  scr_dyn_release(value);

  callback_mode = 1;
  value = parse_ok("{\"a\":1,\"b\":2}", "omission input");
  out = json_test_stringify(value, callback, "  ");
  check(dyn_str_is(out, "{}"), "all omitted properties have no blank lines");
  scr_dyn_release(out);
  scr_dyn_release(value);
  out = json_test_parse("{\"a\":1,\"b\":2}", callback);
  check(out && out->kind == SCR_DYN_OBJ && out->v.obj.len == 0, "reviver deletes actual object properties");
  scr_dyn_release(out);
  out = json_test_parse("[1]", callback);
  check(!out && scr_exc_pending(), "sparse reviver result refuses instead of returning a dense undefined");
  scr_exc_clear();

  callback_mode = 2;
  callback_calls = 0;
  value = parse_ok("{\"a\":1,\"b\":2}", "mutation input");
  out = json_test_stringify(value, callback, "");
  check(dyn_str_is(out, "{\"a\":1,\"b\":9}"), "replacer snapshots keys but reads current values");
  check(callback_calls == 3, "replacer skips keys added during traversal");
  scr_dyn_release(out);
  scr_dyn_release(value);
  callback_calls = 0;
  out = json_test_parse("{\"a\":1,\"b\":2}", callback);
  check(out && scr_dyn_obj_get(out, "b", 1)->v.num == 9, "reviver reads changed sibling");
  check(out && out->v.obj.len == 82, "reviver retains new properties without visiting them");
  check(callback_calls == 3, "reviver key snapshot survives realloc");
  scr_dyn_release(out);

  callback_mode = 4;
  value = parse_ok("{\"a\":{\"x\":1}}", "parent overwrite input");
  out = json_test_stringify(value, callback, "");
  check(dyn_str_is(out, "{\"a\":{\"x\":1}}"), "replacer owns value after edge replacement");
  check(scr_dyn_obj_get(value, "a", 1)->kind == SCR_DYN_NULL, "replacer mutation reaches holder");
  scr_dyn_release(out);
  scr_dyn_release(value);
  out = json_test_parse("{\"a\":{\"x\":1}}", callback);
  check(out && scr_dyn_obj_get(out, "a", 1)->kind == SCR_DYN_OBJ, "reviver returned value wins over holder assignment");
  scr_dyn_release(out);

  callback_mode = 0;
  callback_shared = scr_dyn_new_obj();
  scr_dyn_obj_set(callback_shared, "toJSON", 6, json_test_func(json_test_to_json));
  value = scr_dyn_new_obj();
  scr_dyn_obj_set(value, "nested", 6, scr_dyn_retain(callback_shared));
  out = json_test_stringify(value, callback, "");
  check(dyn_str_is(out, "{\"nested\":42}"), "toJSON precedes replacer and owns its callable");
  scr_dyn_release(out);
  scr_dyn_release(value);
  scr_dyn_release(callback_shared);
  callback_shared = NULL;

  /* Shared subtrees are not cycles. A true back-edge throws only after
   * the replacer gets its chance to replace that edge. Break it manually
   * after the test: dyn graphs do not use the typed cycle collector. */
  value = scr_dyn_new_obj();
  ScrDyn *shared = parse_ok("{\"n\":1}", "shared subtree");
  scr_dyn_obj_set(value, "a", 1, scr_dyn_retain(shared));
  scr_dyn_obj_set(value, "b", 1, scr_dyn_retain(shared));
  out = json_test_stringify(value, callback, "");
  check(dyn_str_is(out, "{\"a\":{\"n\":1},\"b\":{\"n\":1}}"), "DAG is not circular");
  scr_dyn_release(out);
  scr_dyn_release(shared);
  scr_dyn_release(value);
  value = scr_dyn_new_obj();
  scr_dyn_obj_set(value, "self", 4, scr_dyn_retain(value));
  callback_calls = 0;
  out = json_test_stringify(value, callback, "");
  check(!out && scr_exc_pending(), "cyclic replacer output throws");
  check(callback_calls == 2, "replacer observes cyclic edge before cycle error");
  scr_exc_clear();
  callback_mode = 1;
  out = json_test_stringify(value, callback, "");
  check(dyn_str_is(out, "{}"), "replacer may remove a cycle");
  scr_dyn_release(out);
  scr_dyn_obj_set(value, "self", 4, scr_dyn_new_null());
  scr_dyn_release(value);

  callback_mode = 5;
  value = scr_dyn_new_null();
  out = json_test_stringify(value, callback, "");
  check(!out && scr_exc_pending(), "ever-growing replacements hit a catchable depth limit");
  scr_exc_clear();
  scr_dyn_release(value);

  callback_mode = 6;
  callback_shared = scr_dyn_new_num(INFINITY);
  out = json_test_parse("{\"n\":0}", callback);
  check(out && scr_dyn_obj_get(out, "n", 1) == callback_shared, "reviver retains returned shared value");
  scr_dyn_release(out);
  scr_dyn_release(callback_shared);
  callback_shared = NULL;

  /* Branded buffers can enter the dyn tree from native stream callbacks.
   * Their pre-replacer toJSON differs from a buffer returned BY a replacer. */
  const uint8_t bytes[] = { 5, 6 };
  ScrBytes *storage = scr_bytes_from_data(bytes, sizeof bytes);
  callback_shared = scr_dyn_new_buffer_copy(storage);
  scr_bytes_release(storage);
  callback_mode = 0;
  value = scr_dyn_new_obj();
  scr_dyn_obj_set(value, "buffer", 6, scr_dyn_retain(callback_shared));
  out = json_test_stringify(value, callback, "");
  check(dyn_str_is(out, "{\"buffer\":{\"type\":\"Buffer\",\"data\":[5,6]}}"), "branded buffer toJSON precedes callback");
  scr_dyn_release(out);
  scr_dyn_release(value);
  callback_mode = 7;
  value = parse_ok("{\"replace\":0}", "buffer replacement input");
  out = json_test_stringify(value, callback, "");
  check(dyn_str_is(out, "{\"replace\":{\"0\":5,\"1\":6}}"), "returned buffer does not rerun toJSON");
  scr_dyn_release(out);
  scr_dyn_release(value);
  scr_dyn_release(callback_shared);
  callback_shared = NULL;

  for (size_t i = 0; i < 100; i++) {
    callback_mode = 3;
    out = json_test_parse("{\"a\":[1,2],\"b\":3}", callback);
    check(!out && scr_exc_pending(), "reviver exception abandons all walk frames");
    scr_exc_clear();
    value = parse_ok("{\"a\":[1,2],\"b\":3}", "throw input");
    out = json_test_stringify(value, callback, "  ");
    check(!out && scr_exc_pending(), "replacer exception abandons output and walk frames");
    scr_exc_clear();
    scr_dyn_release(value);
    ScrDyn *receiver = scr_dyn_this_get();
    check(receiver->kind == SCR_DYN_UNDEF, "receiver stack restored after exception");
    scr_dyn_release(receiver);
  }
  callback_mode = 0;
  callback_calls = 0;
  out = json_test_parse("{\"a\":1,}", callback);
  check(!out && scr_exc_pending() && callback_calls == 0, "parse error never runs reviver");
  scr_exc_clear();
  out = json_test_parse("17", callback);
  check(out && out->kind == SCR_DYN_NUM && out->v.num == 17, "callback recovery after parse error");
  scr_dyn_release(out);
  scr_dyn_release(callback);
}

int main(void) {
  scr_init();

  /* ── primitives ─────────────────────────────────────────────────── */
  ScrDyn *d = parse_ok("null", "parse null");
  check(d->kind == SCR_DYN_NULL, "null kind");
  scr_dyn_release(d);

  d = parse_ok("true", "parse true");
  check(d->kind == SCR_DYN_BOOL && d->v.b, "true value");
  scr_dyn_release(d);
  d = parse_ok("false", "parse false");
  check(d->kind == SCR_DYN_BOOL && !d->v.b, "false value");
  scr_dyn_release(d);

  d = parse_ok(" -12.5e2 ", "parse number with ws");
  check(d->kind == SCR_DYN_NUM && d->v.num == -1250.0, "number value");
  scr_dyn_release(d);
  d = parse_ok("0", "parse zero");
  check(d->kind == SCR_DYN_NUM && d->v.num == 0, "zero value");
  scr_dyn_release(d);
  d = parse_ok("1e308", "parse big");
  check(d->kind == SCR_DYN_NUM && d->v.num == 1e308, "big value");
  scr_dyn_release(d);
  d = parse_ok("1e999", "parse overflow to Infinity"); /* like JS */
  check(d->kind == SCR_DYN_NUM && isinf(d->v.num), "overflow is Infinity");
  scr_dyn_release(d);

  /* ── strings and escapes ────────────────────────────────────────── */
  d = parse_ok("\"a\\\"b\\\\c\\/d\\b\\f\\n\\r\\t\"", "parse escapes");
  check(dyn_str_is(d, "a\"b\\c/d\b\f\n\r\t"), "escape values");
  scr_dyn_release(d);

  d = parse_ok("\"\\u0041\\u00e9\\u65e5\"", "parse \\u BMP");
  check(dyn_str_is(d, "A\xC3\xA9\xE6\x97\xA5"), "\\u BMP encodes UTF-8");
  scr_dyn_release(d);

  d = parse_ok("\"\\uD83D\\uDE00\"", "parse surrogate pair");
  check(dyn_str_is(d, "\xF0\x9F\x98\x80"), "surrogate pair combines");
  scr_dyn_release(d);

  /* Lone surrogates become U+FFFD (house policy: strings stay well-formed
   * UTF-8; JS would keep the lone surrogate — documented divergence). */
  d = parse_ok("\"x\\uD800y\"", "parse lone high surrogate");
  check(dyn_str_is(d, "x\xEF\xBF\xBDy"), "lone high surrogate -> U+FFFD");
  scr_dyn_release(d);
  d = parse_ok("\"\\uDC00\"", "parse lone low surrogate");
  check(dyn_str_is(d, "\xEF\xBF\xBD"), "lone low surrogate -> U+FFFD");
  scr_dyn_release(d);
  /* High surrogate followed by a non-surrogate escape: U+FFFD, then the
   * escape parses normally. */
  d = parse_ok("\"\\uD800\\u0041\"", "high surrogate then BMP escape");
  check(dyn_str_is(d, "\xEF\xBF\xBD" "A"), "U+FFFD then A");
  scr_dyn_release(d);

  /* Raw UTF-8 passes through. */
  d = parse_ok("\"caf\xC3\xA9\"", "parse raw UTF-8");
  check(dyn_str_is(d, "caf\xC3\xA9"), "raw UTF-8 preserved");
  scr_dyn_release(d);

  /* ── arrays and objects ─────────────────────────────────────────── */
  d = parse_ok("[1, [2, []], \"three\"]", "parse nested array");
  check(d->kind == SCR_DYN_ARR && d->v.arr.len == 3, "array len");
  check(d->v.arr.items[0]->v.num == 1, "arr[0]");
  check(d->v.arr.items[1]->kind == SCR_DYN_ARR && d->v.arr.items[1]->v.arr.len == 2,
        "arr[1] nested");
  check(dyn_str_is(d->v.arr.items[2], "three"), "arr[2] string");
  scr_dyn_release(d);

  d = parse_ok("{\"a\":1,\"b\":{\"c\":[true]},\"a\":2}", "parse object");
  check(d->kind == SCR_DYN_OBJ && d->v.obj.len == 2, "dup keys collapse");
  const ScrDyn *m = scr_dyn_obj_get(d, "a", 1);
  check(m != NULL && m->kind == SCR_DYN_NUM && m->v.num == 2, "later dup key wins");
  m = scr_dyn_obj_get(d, "b", 1);
  check(m != NULL && m->kind == SCR_DYN_OBJ, "nested object");
  check(scr_dyn_obj_get(d, "zz", 2) == NULL, "absent key is NULL");
  scr_dyn_release(d);

  d = parse_ok("{}", "parse empty object");
  check(d->v.obj.len == 0, "empty object");
  scr_dyn_release(d);
  d = parse_ok("[]", "parse empty array");
  check(d->v.arr.len == 0, "empty array");
  scr_dyn_release(d);

  /* ── retain/release semantics ───────────────────────────────────── */
  d = parse_ok("[1,2]", "rc probe");
  ScrDyn *alias = scr_dyn_retain(d);
  scr_dyn_release(d);
  check(alias->v.arr.len == 2, "alias survives first release");
  scr_dyn_release(alias);

  /* ── parse errors (exact OUR-string messages, printed to stderr) ── */
  parse_fail("", "empty input fails");
  parse_fail("   ", "blank input fails");
  parse_fail("{oops", "bad token fails");
  parse_fail("[1,2,", "unterminated array fails");
  parse_fail("[1 2]", "missing comma fails");
  parse_fail("{\"a\"}", "missing colon fails");
  parse_fail("{\"a\":1,}", "trailing comma fails");
  parse_fail("{1:2}", "non-string key fails");
  parse_fail("\"unterminated", "unterminated string fails");
  parse_fail("\"bad \\q\"", "bad escape fails");
  parse_fail("\"ctrl \n\"", "control char in string fails");
  parse_fail("\"\\u12G4\"", "bad unicode escape fails");
  parse_fail("-", "lone minus fails");
  parse_fail("1.", "bare fraction fails");
  parse_fail("1e+", "empty exponent fails");
  parse_fail("1 2", "trailing content fails");
  parse_fail("nul", "truncated literal fails");

  /* Depth cap: 1001 nested arrays throw (catchably) instead of smashing
   * the native stack. */
  {
    size_t n = 1001;
    char *deep = malloc(2 * n + 2);
    for (size_t i = 0; i < n; i++) deep[i] = '[';
    deep[n] = '1';
    for (size_t i = 0; i < n; i++) deep[n + 1 + i] = ']';
    deep[2 * n + 1] = '\0';
    ScrStr *t = scr_str_new(deep, 2 * n + 1);
    free(deep);
    ScrDyn *too = scr_json_parse(t);
    scr_str_release(t);
    check(too == NULL && scr_exc_pending(), "depth cap throws");
    if (scr_exc_pending()) scr_exc_print_uncaught();
  }

  /* ── dynCheck failure messages (the emitted builders' shared path) ── */
  {
    ScrDyn *got = parse_ok("\"nope\"", "fail-path operand");
    ScrDynPath root = { NULL, "items", 0 };
    ScrDynPath idx = { &root, NULL, 2 };
    ScrDynPath leaf = { &idx, "price", 0 };
    scr_dyn_check_fail(&leaf, "number", got);
    check(scr_exc_pending(), "check_fail throws");
    scr_exc_print_uncaught(); /* "TypeError: expected number at $.items[2].price, got string" */
    scr_dyn_check_fail(NULL, "object", NULL);
    scr_exc_print_uncaught(); /* "TypeError: expected object at $, got undefined" */
    scr_dyn_release(got);
  }

  /* ── stringify buffer ───────────────────────────────────────────── */
  {
    ScrJsonBuf b;
    scr_jb_init(&b);
    scr_jb_putc(&b, '[');
    scr_jb_put_f64(&b, 0.0 / 0.0);
    scr_jb_putc(&b, ',');
    scr_jb_put_f64(&b, 1.0 / 0.0);
    scr_jb_putc(&b, ',');
    scr_jb_put_f64(&b, -0.0);
    scr_jb_putc(&b, ',');
    scr_jb_put_f64(&b, 0.1 + 0.2);
    scr_jb_putc(&b, ',');
    ScrStr *tricky = S("q\" b\\ n\n t\t ctl\x01 caf\xC3\xA9");
    scr_jb_put_json_str(&b, tricky);
    scr_str_release(tricky);
    scr_jb_putc(&b, ']');
    ScrStr *out = scr_jb_finish(&b);
    check(str_is(out,
                 "[null,null,0,0.30000000000000004,"
                 "\"q\\\" b\\\\ n\\n t\\t ctl\\u0001 caf\xC3\xA9\"]"),
          "stringify buffer output");
    scr_str_release(out);
  }

  json_callback_tests();

  printf("%d/%d checks passed\n", checks - failures, checks);
  return failures == 0 ? 0 : 1;
}
