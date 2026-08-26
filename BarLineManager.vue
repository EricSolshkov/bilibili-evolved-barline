<template>
  <div class="barline-editor">
    <div class="blm-toolbar">
      <input type="text" placeholder="搜索标题..." :value="query" @input="onQueryInput($event)" />
      <span class="blm-select">
        <button type="button" class="danger" :disabled="!selected.length" @click="removeSelected">
          删除所选 ({{ selected.length }})
        </button>
        <button type="button" @click="toggleAll">
          {{ allSelected ? '取消全选' : '选择全部' }}
        </button>
      </span>
      <span class="blm-io">
        <button type="button" @click="doExport">导出全部</button>
        <button type="button" @click="triggerImport">导入全部</button>
      </span>
      <span class="blm-sort">
        排序：
        <button
          type="button"
          :class="{ active: sortKey === 'openedAt' }"
          @click="setSort('openedAt')"
        >
          最后打开
        </button>
        <button
          type="button"
          :class="{ active: sortKey === 'createdAt' }"
          @click="setSort('createdAt')"
        >
          创建时间
        </button>
        <button type="button" @click="toggleOrder">{{ sortAsc ? '↑' : '↓' }}</button>
      </span>
    </div>
    <div class="blm-hint">共 {{ cards.length }} 个视频</div>
    <div class="blm-grid">
      <div
        v-for="(card, index) in displayCards"
        :key="card.key"
        class="blm-card"
        :class="{ selected: selectedSet.has(card.key) }"
      >
        <a
          class="blm-card-inner"
          :href="cardHref(card)"
          :target="card.bvid || card.aid ? '_blank' : undefined"
          rel="noopener"
        >
          <span class="blm-cover-wrap">
            <img
              v-if="card.cover"
              class="blm-cover"
              :src="card.cover"
              alt=""
              loading="lazy"
              @error="onCoverError(card)"
            />
            <div v-else class="blm-cover blm-cover-empty"></div>
            <span
              class="blm-check"
              :class="{ checked: selectedSet.has(card.key) }"
              @click.prevent.stop="toggleOne(card.key)"
            >
              {{ selectedSet.has(card.key) ? '✓' : '' }}
            </span>
          </span>
          <div class="blm-title">{{ card.title || `#${index + 1} (${card.key})` }}</div>
        </a>
      </div>
      <div v-if="!displayCards.length" class="blm-grid-empty">
        {{ cards.length ? '无匹配视频' : '暂无小节线配置' }}
      </div>
    </div>
    <div class="barline-actions">
      <button type="button" @click="cancel">关闭</button>
    </div>
  </div>
</template>

<script lang="ts">
import { Toast } from '@/core/toast'
import { BarConfig, deleteConfig, importAllConfigs, loadAllConfigs, setVideoMeta } from './config'
import { fetchVideoMeta } from './video-fetch'

interface Card {
  key: string
  title: string
  cover: string
  bvid: string
  aid: string
  createdAt: number
  openedAt: number
}

export default Vue.extend({
  name: 'BarLineManager',
  data() {
    return {
      cards: [] as Card[],
      query: '',
      selected: [] as string[],
      sortKey: 'openedAt' as 'createdAt' | 'openedAt',
      sortAsc: false,
    }
  },
  computed: {
    displayCards(): Card[] {
      const q = this.query.trim().toLowerCase()
      let list = this.cards
      if (q) {
        list = list.filter(c => c.title.toLowerCase().includes(q))
      }
      const key = this.sortKey
      const asc = this.sortAsc
      return [...list].sort((a, b) => {
        const ap = key === 'createdAt' ? a.createdAt : a.openedAt
        const bp = key === 'createdAt' ? b.createdAt : b.openedAt
        return asc ? ap - bp : bp - ap
      })
    },
    selectedSet(): Set<string> {
      return new Set(this.selected)
    },
    allSelected(): boolean {
      return this.cards.length > 0 && this.cards.every(c => this.selected.includes(c.key))
    },
  },
  mounted() {
    this.loadCards()
    // 切回本标签页时自动刷新（面板打开期间其它标签页的改动）。
    document.addEventListener('visibilitychange', this.onVisibilityChange)
  },
  beforeDestroy() {
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
  },
  methods: {
    onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        this.loadCards()
      }
    },
    onQueryInput(e: Event) {
      this.query = (e.target as HTMLInputElement).value
    },
    setSort(key: 'createdAt' | 'openedAt') {
      if (this.sortKey === key) {
        this.sortAsc = !this.sortAsc
      } else {
        this.sortKey = key
        this.sortAsc = false
      }
    },
    toggleOrder() {
      this.sortAsc = !this.sortAsc
    },
    toggleOne(key: string) {
      if (this.selected.includes(key)) {
        this.selected = this.selected.filter(k => k !== key)
      } else {
        this.selected.push(key)
      }
    },
    toggleAll() {
      if (this.allSelected) {
        this.selected = []
      } else {
        this.selected = this.cards.map(c => c.key)
      }
    },
    removeSelected() {
      const keys = [...this.selected]
      if (!keys.length) {
        return
      }
      if (!window.confirm(`确定删除选中的 ${keys.length} 个视频的小节线配置吗？`)) {
        return
      }
      keys.forEach(key => deleteConfig(key))
      this.selected = []
      this.loadCards()
    },
    cardHref(card: Card): string {
      if (card.bvid) {
        return `https://www.bilibili.com/video/${card.bvid}`
      }
      if (card.aid) {
        return `https://www.bilibili.com/video/?aid=${card.aid}`
      }
      return '#'
    },
    onCoverError(card: Card) {
      card.cover = ''
      this.cards = [...this.cards]
    },
    async loadCards() {
      const all = loadAllConfigs()
      const keys = Object.keys(all)
      this.cards = keys
        .map(key => {
          const cfg = all[key]
          return {
            key,
            title: cfg.videoTitle ?? '',
            cover: cfg.videoCover ?? '',
            bvid: cfg.bvid ?? '',
            aid: cfg.aid ?? '',
            createdAt: cfg.createdAt ?? 0,
            openedAt: cfg.openedAt ?? 0,
          }
        })
        .sort((a, b) => b.openedAt - a.openedAt)
      // 清理已不存在的选中项
      const keySet = new Set(keys)
      this.selected = this.selected.filter(k => keySet.has(k))
      keys.forEach(key => {
        this.fetchMeta(key, all[key])
      })
    },
    async fetchMeta(key: string, cfg: BarConfig) {
      if (cfg.videoTitle && cfg.videoCover && cfg.bvid) {
        return
      }
      try {
        const meta = await fetchVideoMeta(key, cfg.aid)
        if (meta) {
          setVideoMeta(key, meta)
          const card = this.cards.find(c => c.key === key)
          if (card) {
            if (meta.videoTitle) {
              card.title = meta.videoTitle
            }
            if (meta.videoCover) {
              card.cover = meta.videoCover
            }
            if (meta.bvid) {
              card.bvid = meta.bvid
            }
            if (meta.aid) {
              card.aid = meta.aid
            }
            this.cards = [...this.cards]
          }
        }
      } catch {
        // 忽略拉取失败
      }
    },
    doExport() {
      const data = loadAllConfigs()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const d = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(
        d.getHours(),
      )}${pad(d.getMinutes())}${pad(d.getSeconds())}`
      a.download = `barline-${stamp}.json`
      a.click()
      URL.revokeObjectURL(url)
    },
    triggerImport() {
      if (!window.confirm('导入将会覆盖当前全部配置')) {
        return
      }
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'application/json, .json'
      input.addEventListener('change', () => {
        const file = input.files?.[0]
        input.value = ''
        if (!file) {
          return
        }
        const toast = Toast.info('正在导入...', '导入全部小节线')
        file.text().then(text => {
          let data: unknown
          try {
            data = JSON.parse(text)
          } catch {
            toast.message = '导入失败：文件不是有效 JSON'
            setTimeout(() => toast.dismiss?.(), 2000)
            return
          }
          if (data && typeof data === 'object' && !Array.isArray(data)) {
            importAllConfigs(data as Record<string, unknown>)
            const count = Object.keys(data as Record<string, unknown>).length
            toast.message = `导入完成，共 ${count} 项，刷新后生效`
            setTimeout(() => toast.dismiss?.(), 2500)
            this.loadCards()
          } else {
            toast.message = '导入失败：内容无效'
            setTimeout(() => toast.dismiss?.(), 2000)
          }
        })
      })
      document.body.appendChild(input)
      input.click()
      input.remove()
    },
    cancel() {
      this.$emit('dialog-close')
    },
  },
})
</script>
