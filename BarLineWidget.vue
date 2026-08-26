<template>
  <DefaultWidget
    class="barline-widget"
    name="设置音乐小节线"
    icon="barline-pencil"
    @click="onClick"
  ></DefaultWidget>
</template>

<script lang="ts">
import { DefaultWidget } from '@/ui'
import { addData } from '@/plugins/data'
import { openEditor } from './index'
import pencilIcon from './pencil.svg'

addData('ui.icons', (icons: { [key: string]: string }) => {
  if (!icons['barline-pencil']) {
    icons['barline-pencil'] = pencilIcon
  }
})

export default Vue.extend({
  name: 'BarLineWidget',
  components: { DefaultWidget },
  methods: {
    onClick() {
      openEditor()
    },
  },
})
</script>
