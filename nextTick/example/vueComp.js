
export default defineComponent({
  setup() {
    const a = ref(a);
    return () => {
      return h('div', [a.value])
    }
  },
})
