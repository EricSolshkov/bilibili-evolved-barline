<template>
  <div class="multiple-widgets">
    <DefaultWidget
      class="barline-widget"
      name="设置当前视频小节线"
      icon="barline-pencil"
      @click="openEditor"
    ></DefaultWidget>
    <DefaultWidget
      class="barline-widget"
      name="管理全部视频小节线"
      icon="barline-manage"
      @click="openManager"
    ></DefaultWidget>
  </div>
</template>

<script lang="ts">
import { DefaultWidget } from '@/ui'
import { addData } from '@/plugins/data'
import { openEditor, openManager } from './index'
import pencilIcon from './pencil.svg'
import manageIcon from './manage.svg'

addData('ui.icons', (icons: { [key: string]: string }) => {
  if (!icons['barline-pencil']) {
    icons['barline-pencil'] = pencilIcon
  }
  if (!icons['barline-manage']) {
    icons['barline-manage'] = manageIcon
  }
})

export default Vue.extend({
  name: 'BarLineWidget',
  components: { DefaultWidget },
  methods: {
    openEditor() {
      openEditor()
    },
    openManager() {
      openManager()
    },
  },
})
</script>
